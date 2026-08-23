import {
  parseMachineReply,
  findWinner,
  isContestedCell,
  presetReadingValue,
  readingEnd,
  winLinesFor,
  type Player,
} from "./game-rules";
import {
  coordinateForIndex,
  indexForCoordinate,
  oppositeSide,
  profileLabel,
  proposalLabel,
} from "./online-engine";
import type { JudgeAction, PublicRoom } from "./online-types";

const JUDGEMENT_CORE = `自由読みは、絵・名前・共通説明・申告された表示差から対象へつながるかを、あなた自身の知識や相手との関係性も含めて判断してください。二人だけの愛称や象徴も、その対象を直接指す固定の呼び名なら成立できます。成立している読みを勝負上止めたい場合は「異議」、意味のつながりがかなり遠ければ理由つきで「不成立」、納得したら「受理」です。⚡争奪中のマスには異議を使えませんが、不成立と固定機械ルールは通常どおり有効です。現在文字違い、取得済み、選択不可、「ん」終わりなどの機械ルールはアプリが固定判定します。`;

function isTeamMode(room: PublicRoom) {
  return room.settings.teamMode === true;
}

function panelDescription(room: PublicRoom, index: number) {
  const panel = room.game.board[index];
  const owner = room.game.claims[index];
  if (owner) return `${coordinateForIndex(index, room.game.boardSize)}:${owner === "O" ? "○" : "▲"}取得済み`;
  const blocked = room.game.retryBlocked.includes(index) ? "｜今回選択不可" : "";
  const contested = isContestedCell(room.game.cellObjections, index) ? "｜⚡争奪中（異議不可）" : "";
  const presets = panel.readings.map(presetReadingValue).join("・");
  return `${coordinateForIndex(index, room.game.boardSize)}｜${panel.icon}｜${panel.name}｜共通説明:${panel.visualDescription}｜正式読み:${presets}${blocked}${contested}`;
}

function boardSummary(room: PublicRoom) {
  return room.game.board.map((_, index) => panelDescription(room, index)).join("\n");
}

function lineSituation(room: PublicRoom) {
  const items: string[] = [];
  for (const side of ["O", "X"] as const) {
    for (const line of winLinesFor(room.game.boardSize)) {
      const owned = line.filter((index) => room.game.claims[index] === side);
      const empty = line.filter((index) => !room.game.claims[index]);
      if (owned.length === room.game.boardSize - 1 && empty.length === 1) {
        items.push(`${side === "O" ? "○" : "▲"}が${coordinateForIndex(empty[0], room.game.boardSize)}を取ると勝利`);
      }
    }
  }
  return items.length ? items.join("／") : "次の一手で完成するラインはなし";
}

function sideContext(room: PublicRoom, side: Player) {
  const own = profileLabel(room.players[side]?.profile);
  const opponent = profileLabel(room.players[oppositeSide(side)]?.profile);
  if (isTeamMode(room)) {
    return `あなたは${own}チームのAIセコンド兼・貼り付け文生成担当で、${side === "O" ? "○" : "▲"}側です。対戦相手は${opponent}チームです。最終決定権はあなたのユーザーにあります。`;
  }
  return `あなたは${own}チームの思考・会話担当で、${side === "O" ? "○" : "▲"}側です。対戦相手は${opponent}チームです。`;
}

export function buildAiIntroPrompt(room: PublicRoom, side: Player) {
  const first = room.settings.startingPlayer === side ? "あなた側" : "相手側";
  const teamGuide = isTeamMode(room)
    ? `\n## チーム戦での役割\n- 今回はユーザー主導。あなたはセコンドとして盤面分析・候補・推奨手・理由をはっきり伝える\n- 手番文や判定文を受け取った直後は、勝手に最終決定せず、まずユーザーと相談する\n- 最初の相談返答では【手番:…】【判定:…】の機械読取行を出さない\n- ユーザーが最終決定した後、その決定どおりにアプリ貼り付け用の【】1行を生成する\n- 受理後に次の一手も必要な判定では、判定と次手の両方がユーザー決定済みになってから1行を生成する\n- 相手への会話・煽り・雑談・掛け合いは今までどおり楽しんでよい`
    : `\n## 会話と返答\n盤面だけを機械的に処理せず、相手の読みや作戦へあなたらしく反応し、勝負・雑談・掛け合いも楽しんでください。毎回アプリが指定する機械読取用の【】1行だけを、最後の独立したMarkdownコードブロックへ入れてください。会話本文はコードブロックの外に書きます。`;
  return `# MIRROR WORD GRID：オンライン対戦の準備\n\n${sideContext(room, side)}\nユーザー同士がDiscordやXのDMで招待URLを送り、このアプリの共有盤面を見ながら遊びます。AI同士をAPI接続してはいません。あなたのユーザーが、手番文をこの会話へ運び、あなたの返答をアプリへ戻す「伝書鳩」です。\n\n## 今回の設定\n- 盤面：${room.settings.boardSize}×${room.settings.boardSize}\n- 先攻：${first}\n- 開始文字：「${room.game.currentChar}」\n- 異議札：各側${room.settings.objectionLimit}枚（同じ相手手番では1回まで）\n${isTeamMode(room) ? "- 対戦形式：人間＋AIのチーム戦（ユーザーが最終決定、AIはセコンド）\n" : ""}\n## ルール\n- 現在文字から始まる読みで空き札を取り、縦・横・斜めの一列を先に完成した側の勝ち\n- 正式読みは理由なしで成立。自由読みは理由が必要\n- 自由読みが成立していても、勝負上止めたいなら異議札を使える\n- 同じ未取得マスへ○・▲双方が1回ずつ異議を使うと「争奪マス」になり、以後そのマスへの異議は使えない\n- 最後の空き1マスが争奪マスになった場合は「最終争奪」として引き分け\n- 札との意味的なつながりがかなり遠い自由読みは理由つきで不成立にできる\n- 「ん」で終わる読みを宣言した側は即敗北\n- 双方ともライン完成不能になったら引き分け\n- 語頭の濁音・半濁音は清音と接続できる\n- 頭文字合わせだけの「お・ご」付けは使えない\n${teamGuide}\n\n${JUDGEMENT_CORE}\n\n理解できたら、まだ一手は選ばず、ユーザーへ準備できたことを普通の会話で伝えてください。最後のコードブロックには【準備:OK】だけを書いてください。`;
}

export function buildAiTurnPrompt(room: PublicRoom, side: Player) {
  const game = room.game;
  const selectable = game.board
    .map((_, index) => index)
    .filter((index) => !game.claims[index] && !game.retryBlocked.includes(index))
    .map((index) => coordinateForIndex(index, game.boardSize))
    .join("、");
  const team = isTeamMode(room);
  const opening = team
    ? `いまはあなた側の手番です。まずユーザーと相談してください。盤面を分析し、候補と戦略、あなたの推奨手をはっきり示しますが、最終決定はユーザーです。`
    : `いまはあなた側の手番です。勝つための一手を選び、ユーザーがアプリへ戻せる形で答えてください。`;
  const responseGuide = team
    ? `## チーム戦・相談手順\n1. この文を受け取った最初の返答では、まだ【手番:…】を出さない\n2. 盤面の危険箇所・勝ち筋・候補を整理し、あなたのおすすめをユーザーへ伝える\n3. ユーザーが最終的なマス・読みを決める。別案を選んだ場合もその決定を尊重する\n4. 決定後の返答でのみ、会話のあとに次の機械読取用1行を独立したMarkdownコードブロックへ入れる\n\nユーザー決定後の形式：\n【手番:A1｜読み:かさ｜読み仮名:かさ｜理由:傘の絵をそのまま読んだ｜コード:${game.actionCode}】\n\n最初の相談返答では、この【手番】行もコードブロックも出さないでください。`
    : `あなたらしい会話や作戦はコードブロックの外へ書き、最後の独立コードブロックには次の形式の1行だけを書いてください。\n\n【手番:A1｜読み:かさ｜読み仮名:かさ｜理由:傘の絵をそのまま読んだ｜コード:${game.actionCode}】`;
  return `# MIRROR WORD GRID：${team ? "チーム戦・オンライン手番相談" : "オンライン手番"}\n\n${sideContext(room, side)}\n${opening}\n\n手番コード：${game.actionCode}\n現在文字：「${game.currentChar}」\n選択可能：${selectable}\n残り異議札：○ ${game.objections.O}枚／▲ ${game.objections.X}枚\n戦況：${lineSituation(room)}\n\n## 盤面\n${boardSummary(room)}\n\n## 固定ルール\n- 「${game.currentChar}」から始まる読みを宣言する\n- 「ん」で終わる読みは即敗北なので避ける\n- 正式読みは理由なしで成立。自由読みは札とのつながりを理由に書く\n- 漢字などを表示する場合も、読み仮名はかな／カナで別に書く\n- 取得済み・今回選択不可の札は選ばない\n- 自分の列を伸ばす・相手を止める戦況も考える\n\n${JUDGEMENT_CORE}\n\n${responseGuide}`;
}

export function buildAiJudgePrompt(room: PublicRoom, side: Player) {
  const game = room.game;
  const proposal = game.proposal;
  if (!proposal) return "判定待ちの読みはありません。";
  const panel = game.board[proposal.panelIndex];
  const contested = isContestedCell(game.cellObjections, proposal.panelIndex);
  const objectionAvailable = !contested && game.objections[side] > 0 && !game.objectionUsedThisTurn[side];
  const acceptedClaims = { ...game.claims, [proposal.panelIndex]: proposal.player };
  const acceptedResult = findWinner(acceptedClaims, game.boardSize);
  const nextChar = readingEnd(proposal.reading);
  const acceptedRoom: PublicRoom = {
    ...room,
    game: {
      ...game,
      claims: acceptedClaims,
      turn: side,
      currentChar: nextChar,
      proposal: null,
      phase: acceptedResult.winner ? "finished" : "select",
      retryBlocked: [],
    },
  };
  const nextSelectable = game.board
    .map((_, index) => index)
    .filter((index) => !acceptedClaims[index])
    .map((index) => coordinateForIndex(index, game.boardSize))
    .join("、");
  const continuation = acceptedResult.winner
    ? "受理すると試合終了です。受理の行に次手は付けません。"
    : `受理する場合は、そのままあなたの次の一手も同じ最終行へ指定してください。これで判定と次の手番を1回のコピー往復で反映できます。\n受理後の文字：「${nextChar}」\n受理後の選択可能：${nextSelectable}\n受理後の戦況：${lineSituation(acceptedRoom)}\n\n### 受理後の盤面\n${boardSummary(acceptedRoom)}`;
  const acceptedFormat = acceptedResult.winner
    ? `【判定:受理｜コード:${game.actionCode}】`
    : `【判定:受理｜次手:A1｜読み:${nextChar}から始まる表示語｜読み仮名:${nextChar}から始まるかな読み｜理由:その札をそう読んだ理由｜コード:${game.actionCode}】`;
  const team = isTeamMode(room);
  const opening = team
    ? "相手の自由読みについて、まずユーザーと相談してください。あなたは成立性と戦況を分析して推奨判定を示しますが、最終決定はユーザーです。"
    : "相手の自由読みを判定してください。";
  const responseGuide = team
    ? `## チーム戦・相談手順\n1. この文を受け取った最初の返答では、まだ【判定:…】を出さない\n2. 「受理・不成立${objectionAvailable ? "・異議" : ""}」の妥当性と戦略上の影響を説明し、あなたの推奨をユーザーへ伝える\n3. 受理して試合が続く場合は、下の受理後盤面も使って次の一手まで相談する\n4. ユーザーが判定${acceptedResult.winner ? "" : "と、必要なら次の一手"}を最終決定した後、その決定どおりの機械読取用1行だけを最後の独立コードブロックへ入れる\n\nユーザー決定後に使う形式：\n${acceptedFormat}\n【判定:不成立｜理由:札そのものとの意味的なつながりが遠い｜コード:${game.actionCode}】${objectionAvailable ? `\n【判定:異議｜理由:成立はするが戦略上ここは止めたい｜コード:${game.actionCode}】` : ""}\n\n最初の相談返答では、これらの【判定】行もコードブロックも出さないでください。`
    : `選択肢は「受理」「不成立」${objectionAvailable ? "「異議」" : ""}です。不成立・異議には理由を書いてください。あなたらしい反応はコードブロックの外へ書き、最後の独立コードブロックには選んだ1行だけを書いてください。\n\n${acceptedFormat}\n【判定:不成立｜理由:札そのものとの意味的なつながりが遠い｜コード:${game.actionCode}】${objectionAvailable ? `\n【判定:異議｜理由:成立はするが戦略上ここは止めたい｜コード:${game.actionCode}】` : ""}`;
  return `# MIRROR WORD GRID：${team ? "チーム戦・オンライン判定相談" : "オンライン判定＋次の一手"}\n\n${sideContext(room, side)}\n${opening}\n\n手番コード：${game.actionCode}\nマス：${coordinateForIndex(proposal.panelIndex, game.boardSize)}\n札：${panel.icon} ${panel.name}\n共通説明：${panel.visualDescription}\n正式読み：${panel.readings.map(presetReadingValue).join("・")}\n宣言：「${proposalLabel(proposal)}」\n理由：${proposal.reason}\n現在文字：「${game.currentChar}」\n残り異議札：あなた側 ${game.objections[side]}枚\n異議：${contested ? "このマスは⚡争奪中のため使用不可" : objectionAvailable ? "この相手手番で使用可能" : "現在は使用不可"}\n戦況：${lineSituation(room)}\n\n${JUDGEMENT_CORE}\n\n## 受理する場合\n${continuation}\n\n${responseGuide}`;
}

export type ParsedAiTurn = {
  ok: true;
  action: {
    type: "declare";
    panelIndex: number;
    display: string;
    readingAid: string;
    reason: string;
    sourceCode: string;
  };
} | { ok: false; error: string };

export function parseAiTurnReply(room: PublicRoom, text: string): ParsedAiTurn {
  const parsed = parseMachineReply(text);
  if (!parsed.ok) return parsed;
  const coordinate = parsed.fields["手番"];
  const display = parsed.fields["読み"];
  const sourceCode = parsed.fields["コード"];
  if (!coordinate || !display || !sourceCode) return { ok: false, error: "AI返答に「手番・読み・コード」がそろっていません。" };
  if (sourceCode !== room.game.actionCode) return { ok: false, error: "別の手番の返答です。最新の手番文をAIへ渡し直してね。" };
  const panelIndex = indexForCoordinate(coordinate, room.game.boardSize);
  if (panelIndex < 0) return { ok: false, error: "AIが返した座標を盤面で見つけられませんでした。" };
  return {
    ok: true,
    action: {
      type: "declare",
      panelIndex,
      display,
      readingAid: parsed.fields["読み仮名"] ?? "",
      reason: parsed.fields["理由"] ?? "",
      sourceCode,
    },
  };
}

export type ParsedAiJudge = { ok: true; action: JudgeAction } | { ok: false; error: string };

export function parseAiJudgeReply(room: PublicRoom, text: string): ParsedAiJudge {
  const parsed = parseMachineReply(text);
  if (!parsed.ok) return parsed;
  const value = parsed.fields["判定"];
  const sourceCode = parsed.fields["コード"];
  if (!value || !sourceCode) return { ok: false, error: "AI返答に「判定・コード」がそろっていません。" };
  if (sourceCode !== room.game.actionCode) return { ok: false, error: "別の判定待ちへの返答です。最新の判定文をAIへ渡し直してね。" };
  const verdict = value === "受理" ? "accept" : value === "異議" ? "objection" : value === "不成立" ? "not-established" : null;
  if (!verdict) return { ok: false, error: "判定は「受理・異議・不成立」のどれかで返してもらってね。" };
  if (verdict !== "accept" && !parsed.fields["理由"]) return { ok: false, error: "異議・不成立には判定理由が必要です。" };
  if (verdict === "objection" && room.game.proposal && isContestedCell(room.game.cellObjections, room.game.proposal.panelIndex)) {
    return { ok: false, error: "このマスは⚡争奪中だから、もう異議は使えません。不成立または受理で返してもらってね。" };
  }
  if (verdict !== "accept") {
    return { ok: true, action: { type: "judge", verdict, reason: parsed.fields["理由"] ?? "", sourceCode } };
  }

  const proposal = room.game.proposal;
  if (!proposal) return { ok: false, error: "判定待ちの読みが見つかりません。最新の画面へ更新してね。" };
  const acceptedClaims = { ...room.game.claims, [proposal.panelIndex]: proposal.player };
  if (findWinner(acceptedClaims, room.game.boardSize).winner) {
    return { ok: true, action: { type: "judge", verdict, sourceCode } };
  }

  const coordinate = parsed.fields["次手"];
  const display = parsed.fields["読み"];
  if (!coordinate || !display) return { ok: false, error: "受理後の「次手・読み」がありません。判定依頼をAIへ渡し直してね。" };
  const panelIndex = indexForCoordinate(coordinate, room.game.boardSize);
  if (panelIndex < 0) return { ok: false, error: "AIが返した次手の座標を盤面で見つけられませんでした。" };
  return {
    ok: true,
    action: {
      type: "judge",
      verdict,
      sourceCode,
      nextMove: {
        panelIndex,
        display,
        readingAid: parsed.fields["読み仮名"] ?? "",
        reason: parsed.fields["理由"] ?? "",
      },
    },
  };
}

export function nextCharacterForProposal(room: PublicRoom) {
  return room.game.proposal ? readingEnd(room.game.proposal.reading) : "";
}
