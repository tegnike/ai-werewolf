import Image from 'next/image';

const AGENT_PORTRAIT_REVISION = 'characters-20260720';

export function agentPortraitSrc(index: number): string {
  return `/assets/agents/agent_${index}.png?v=${AGENT_PORTRAIT_REVISION}`;
}

export function AgentAvatar({ index, name, dead }: { index: number; name: string; dead: boolean }) {
  return (
    <div className={`agent-avatar ${dead ? 'dead' : ''}`}>
      <Image src={agentPortraitSrc(index)} width={96} height={96} alt={`${name}の立ち絵`} priority={index <= 3} />
    </div>
  );
}
