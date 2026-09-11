import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { isValidAddress, isValidTxHash, queryGenLayerReceipt, authenticateWalletProof } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');

    if (!wallet || !isValidAddress(wallet)) {
      return NextResponse.json({ error: 'Valid wallet address is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('pending_verifications')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    return NextResponse.json(data[0] || null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { txHash, wallet_address, profile_url } = body;

    // 1. Transaction Proof Validation
    if (!isValidTxHash(txHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction proof: txHash must be a valid 32-byte 0x-prefixed hex string' },
        { status: 400 }
      );
    }

    // 2. Wallet Proof Validation
    if (!isValidAddress(wallet_address)) {
      return NextResponse.json(
        { error: 'Invalid wallet proof: wallet_address must be a valid Ethereum/GenLayer address' },
        { status: 400 }
      );
    }

    // Verify header wallet proof if present
    const headerWallet = req.headers.get('x-wallet-address');
    if (headerWallet && headerWallet.toLowerCase() !== wallet_address.toLowerCase()) {
      return NextResponse.json(
        { error: 'Wallet proof mismatch between header and payload' },
        { status: 401 }
      );
    }

    const cleanProfile = (profile_url || '').trim();
    if (!cleanProfile.toLowerCase().includes('github.com/')) {
      return NextResponse.json(
        { error: 'Invalid GitHub profile URL' },
        { status: 400 }
      );
    }

    // Clear any prior pending record for this wallet
    await supabase
      .from('pending_verifications')
      .delete()
      .eq('wallet_address', wallet_address.toLowerCase());

    const { data, error } = await supabase
      .from('pending_verifications')
      .insert([
        {
          tx_hash: txHash.toLowerCase(),
          wallet_address: wallet_address.toLowerCase(),
          profile_url: cleanProfile,
          status: 'Pending'
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
    const wallet = searchParams.get('wallet');
    const txHash = searchParams.get('txHash');

    if (!wallet || !isValidAddress(wallet)) {
      return NextResponse.json({ error: 'Valid wallet address is required' }, { status: 400 });
    }

    // Verify wallet proof or on-chain transaction finalization proof
    const hasWalletProof = authenticateWalletProof(req, wallet) || req.headers.get('x-wallet-address')?.toLowerCase() === wallet.toLowerCase();

    let isAuthorized = hasWalletProof;

    if (!isAuthorized && txHash && isValidTxHash(txHash)) {
      const receipt = await queryGenLayerReceipt(txHash);
      if (receipt) {
        const rStatus = (receipt.status || '').toString().toLowerCase();
        if (rStatus === 'finalized' || rStatus === 'success' || rStatus === '1' || rStatus === '0x1') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized verification deletion: Requires matching wallet proof or on-chain transaction proof' },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('pending_verifications')
      .delete()
      .eq('wallet_address', wallet.toLowerCase());

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { wallet_address, status, txHash } = body;

    if (!wallet_address || !isValidAddress(wallet_address)) {
      return NextResponse.json({ error: 'Valid wallet_address is required' }, { status: 400 });
    }

    if (!status || !['Failed', 'Pending'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    // Authenticate mutation using wallet proof OR on-chain transaction failure proof
    const hasWalletProof = authenticateWalletProof(req, wallet_address) || req.headers.get('x-wallet-address')?.toLowerCase() === wallet_address.toLowerCase();

    let isAuthorized = hasWalletProof;

    if (!isAuthorized && txHash && isValidTxHash(txHash)) {
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
        { error: 'Unauthorized verification status mutation: Requires matching wallet proof or on-chain transaction proof' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('pending_verifications')
      .update({ status })
      .eq('wallet_address', wallet_address.toLowerCase())
      .select();

    if (error) throw error;

    return NextResponse.json(data?.[0] || null);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
