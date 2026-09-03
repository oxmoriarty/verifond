import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

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

    const { data, error } = await supabase
      .from('pending_projects')
      .insert([
        {
          tx_hash: txHash,
          submitter,
          name,
          details,
          url,
          amount_requested,
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

    if (!txHash) {
      return NextResponse.json({ error: 'txHash is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('pending_projects')
      .delete()
      .eq('tx_hash', txHash);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
