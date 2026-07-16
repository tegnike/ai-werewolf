import { MatchViewer } from '@/ui/MatchViewer';

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchViewer matchId={id} mode="replay" />;
}
