import type { Role, SeatId } from './types';

export const SEATS = Array.from({ length: 9 }, (_, index) => `seat-${index + 1}` as SeatId);
export const ROLE_DECK: Role[] = [
  'villager', 'villager', 'villager', 'werewolf', 'werewolf', 'seer', 'medium', 'bodyguard', 'madman',
];
export const MAX_DAYS = 9;
export const MAX_API_CALLS = 240;
export const MAX_SPEECH_CODE_POINTS = 200;
export const MODEL = 'gpt-5.6-luna' as const;
export const NIGHT_ZERO_UNINFORMED_FACT = '0日目の占い先は、まだ誰も発言していない時点での規則上の無情報選択です。推理上の選定理由は存在しないため、聞かれたら理由がないことをそのまま伝えてください。';
export const SANITIZED_VOTE_REASON = '公開された議論と候補を比較して決めました。';
export const ROLE_LABEL: Record<Role, string> = {
  villager: '村人', werewolf: '人狼', seer: '占い師', medium: '霊媒師', bodyguard: '狩人', madman: '狂人',
};
export const TEAM_LABEL = { village: '村人陣営', werewolf: '人狼陣営', draw: '引き分け' } as const;
