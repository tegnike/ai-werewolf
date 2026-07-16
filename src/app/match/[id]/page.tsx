import { MatchViewer } from '@/ui/MatchViewer';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchViewer matchId={id} mode="live" />;
}
