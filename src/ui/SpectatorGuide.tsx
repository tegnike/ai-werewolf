'use client';

import { useRef } from 'react';

const roles = [
  ['村人 ×3', '能力はありません。会話と投票で人狼を探します。'],
  ['人狼 ×2', '互いを知り、夜に相談して1名を襲撃します。'],
  ['占い師 ×1', '毎夜1名を占い、人狼かどうかを知ります。'],
  ['霊媒師 ×1', '前日に処刑された人物が人狼かどうかを知ります。'],
  ['狩人 ×1', '毎夜1名を襲撃から守ります。連続護衛はできません。'],
  ['狂人 ×1', '判定は人間ですが、人狼陣営の勝利を目指します。'],
] as const;

export function SpectatorGuide() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return <>
    <button className="guide-open" type="button" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>？ ルール</button>
    <dialog className="spectator-guide" ref={dialogRef} aria-labelledby="spectator-guide-title">
      <div className="guide-head">
        <div><span className="section-kicker">SPECTATOR GUIDE</span><h2 id="spectator-guide-title">観戦ガイド</h2></div>
        <button className="guide-close" type="button" aria-label="観戦ガイドを閉じる" onClick={() => dialogRef.current?.close()}>×</button>
      </div>
      <div className="guide-body">
        <section aria-labelledby="guide-roles"><h3 id="guide-roles">9人の配役</h3><dl className="guide-role-list">{roles.map(([role, description]) => <div key={role}><dt>{role}</dt><dd>{description}</dd></div>)}</dl></section>
        <section aria-labelledby="guide-victory"><h3 id="guide-victory">勝利条件</h3><ul><li><strong>村人陣営</strong> — 生存する人狼を0名にする。</li><li><strong>人狼陣営</strong> — 生存人狼数が、生存する非人狼人数以上になる。</li></ul><p className="guide-note">狂人は勝敗の人数判定では非人狼ですが、人狼陣営が勝てば本人も勝利です。</p></section>
        <section aria-labelledby="guide-flow"><h3 id="guide-flow">昼と夜の進行</h3><ol className="guide-flow"><li><span>昼</span>指名と発言希望で話者が移る自由討論</li><li><span>投票</span>全票確定後に記名開票</li><li><span>処刑</span>最多得票者を処刑</li><li><span>夜</span>人狼・各役職が秘密に行動</li><li><span>夜明け</span>犠牲者を公開して次の日へ</li></ol><p className="guide-note">占い師・霊媒師の名乗りや結果には、狂人・人狼の騙りも含まれます。役職主張ボードは本人の主張を記録するだけで、真偽は保証しません。</p></section>
        <section aria-labelledby="guide-views"><h3 id="guide-views">2つの観戦視点</h3><div className="guide-view-grid"><article><strong>公開視点</strong><p>生存者と同じ公開情報だけで推理します。役職や夜の行動は決着まで見えません。</p></article><article><strong>GM視点</strong><p>進行中から全役職と秘密の行動を確認できます。終了後は公開視点でも答え合わせできます。</p></article></div></section>
      </div>
      <div className="guide-foot"><span>Escキーでも閉じられます</span><button type="button" onClick={() => dialogRef.current?.close()}>観戦に戻る</button></div>
    </dialog>
  </>;
}
