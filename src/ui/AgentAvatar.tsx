import Image from 'next/image';

export function AgentAvatar({ index, name, dead }: { index: number; name: string; dead: boolean }) {
  return (
    <div className={`agent-avatar ${dead ? 'dead' : ''}`}>
      <Image src={`/assets/agents/agent_${index}.png`} width={96} height={96} alt={`${name}の立ち絵`} priority={index <= 3} />
    </div>
  );
}
