import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { isValidAddress, isValidTxHash, queryGenLayerReceipt, authenticateWalletProof } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('pending_projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { txHash, submitter, name, details, url, amount_requested } = body;

    // 1. Transaction Proof: Validate transaction hash format
    if (!isValidTxHash(txHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction proof: txHash must be a valid 32-byte 0x-prefixed hex string' },
        { status: 400 }
      );
    }

    // 2. Wallet Proof: Validate submitter address format
    if (!isValidAddress(submitter)) {
      return NextResponse.json(
        { error: 'Invalid wallet proof: submitter must be a valid Ethereum/GenLayer address' },
        { status: 400 }
      );
    }

    // Verify header wallet proof if provided
    const headerWallet = req.headers.get('x-wallet-address');
    if (headerWallet && headerWallet.toLowerCase() !== submitter.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet proof mismatch between header and submitter' },
        { status: 401 }
      );
    }

    // 3. Input Bounds Validation
    const requestedAmount = Number(amount_requested);
    if (isNaN(requestedAmount) || requestedAmount < 1 || requestedAmount > 100) {
      return NextResponse.json(
        { error: 'Requested amount must be between 1 and 100 GEN' },
        { status: 400 }
      );
    }

    const cleanUrl = (url || '').trim().toLowerCase();
    if (!cleanUrl.includes('github.com/')) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository URL' },
        { status: 400 }
      );
    }

    // If resubmitting an existing repo URL (or submitting anew), remove any prior pending/failed records for this url
    await supabase
      .from('pending_projects')
      .delete()
      .ilike('url', cleanUrl);

    const { data, error } = await supabase
      .from('pending_projects')
      .insert([
        {
          tx_hash: txHash.toLowerCase(),
          submitter: submitter.toLowerCase(),
          name: name ? String(name).trim() : 'Untitled Project',
          details: details ? String(details).trim() : '',
          url: cleanUrl,
          amount_requested: requestedAmount,
          status: 'Pending',
          score: 0,
          reason: 'Waiting for GenLayer AI Evaluation...',
          withdrawn: false
        }
      ])
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const txHash = searchParams.get('txHash');
    const walletParam = searchParams.get('wallet');

    if (!isValidTxHash(txHash)) {
      return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
    }

    // Look up the project record
    const { data: existingRecords, error: fetchErr } = await supabase
      .from('pending_projects')
      .select('*')
      .eq('tx_hash', txHash!.toLowerCase())
      .limit(1);

    if (fetchErr) throw fetchErr;

    const record = existingRecords?.[0];
    if (!record) {
      return NextResponse.json({ success: true, message: 'Record already removed or non-existent' });
    }

    // Authenticate deletion using wallet proof OR on-chain transaction finalization proof
    const hasWalletProof =
      (walletParam && isValidAddress(walletParam) && walletParam.toLowerCase() === record.submitter.toLowerCase()) ||
      authenticateWalletProof(req, record.submitter);

    let isAuthorized = hasWalletProof;

    if (!isAuthorized) {
      // Check on-chain transaction proof via GenLayer RPC
      const receipt = await queryGenLayerReceipt(txHash!);
      if (receipt) {
        const receiptStatus = (receipt.status || '').toString().toLowerCase();
        // If the transaction has finalized or executed on-chain, deletion of pending state is provably valid
        if (receiptStatus === 'finalized' || receiptStatus === 'success' || receiptStatus === '1' || receiptStatus === '0x1') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized pending deletion: Requires matching wallet proof or on-chain transaction finalization' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('pending_projects')
      .delete()
      .eq('tx_hash', txHash!.toLowerCase());

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { txHash, status, reason, caller } = body;

    if (!isValidTxHash(txHash)) {
      return NextResponse.json({ error: 'Valid txHash is required' }, { status: 400 });
    }

    if (!status || !['Failed', 'Pending'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    // Look up existing pending project
    const { data: existing, error: findError } = await supabase
      .from('pending_projects')
      .select('*')
      .eq('tx_hash', txHash.toLowerCase())
      .limit(1);

    if (findError) throw findError;
    const record = existing?.[0];

    if (!record) {
      return NextResponse.json({ error: 'Pending project not found' }, { status: 404 });
    }

    // Authenticate mutation using wallet proof OR on-chain transaction failure proof
    const hasWalletProof =
      (caller && isValidAddress(caller) && caller.toLowerCase() === record.submitter.toLowerCase()) ||
      authenticateWalletProof(req, record.submitter);

    let isAuthorized = hasWalletProof;

    if (!isAuthorized) {
      // Verify transaction failure proof via GenLayer RPC
      const receipt = await queryGenLayerReceipt(txHash);
      if (receipt) {
        const rStatus = (receipt.status || '').toString().toLowerCase();
        const consensusStatus = ((receipt as any).consensusStatus || (receipt as any).consensus_status || '').toString().toLowerCase();
        const execResult = ((receipt as any).txExecutionResultName || (receipt as any).tx_execution_result_name || '').toString().toLowerCase();

        const isFailedOnChain =
          rStatus === 'reverted' ||
          rStatus === 'error' ||
          rStatus === '0x0' ||
          rStatus === 'undetermined' ||
          rStatus === 'canceled' ||
          rStatus.includes('timeout') ||
          consensusStatus === 'undetermined' ||
          consensusStatus.includes('timeout') ||
          execResult.includes('error');

        if (isFailedOnChain) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized pending status mutation: Requires matching wallet proof or verified on-chain transaction failure' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('pending_projects')
      .update({ status, reason: reason || 'Project submission failed or was dropped.' })
      .eq('tx_hash', txHash.toLowerCase())
      .select();

    if (error) throw error;

    return NextResponse.json(data?.[0] || null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
