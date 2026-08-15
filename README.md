# MIRROR WORD GRID

絵文字の読みをしりとりでつなぎ、○×のラインを作る対戦ゲームです。

## 遊び方

- `/` — ひとつの端末で遊ぶ。人間同士、または自分のホームAIへ手番をコピーして遊べます。
- `/online` — 使い捨ての対戦部屋を作る。招待URLをDiscordやXのDMで送り、別端末から同じ盤面を共有します。
- `/share` — 通常対戦の読み取り専用盤面リンクです。

オンライン対戦でもAI APIは使いません。それぞれのユーザーが自分のホームAIへ手番文をコピーし、AIの返答を共有盤面へ貼り戻します。両側とも、人間操作とAI操作を自由に選べます。

## オンライン部屋

- ホストは○側、招待された相手は×側です。
- 招待用アクセストークンはURLフラグメントへ入るため、通常のHTTPリクエストやサーバーログへ送信されません。
- サーバーはアクセストークンのSHA-256ハッシュだけを保存します。
- すべての更新にrevisionを要求し、古い盤面からの上書きは`409 Conflict`で拒否します。
- 有効な操作ごとに期限が延長され、最後の操作から24時間でRedisから自動消去されます。閲覧・ポーリングだけでは延長されません。
- 同じ端末では参加情報を`localStorage`へ保存し、部屋へ戻れます。

## 開発

Node.js 22.13以上が必要です。

```bash
npm ci
npm run test:rules
npm run test:online
npm run lint
npm run build
```

APIまで含むローカル通し試験は、Next.js開発サーバーを起動してから実行します。

```bash
npx next dev
npm run test:online-api
```

開発環境では共有ストレージの環境変数がない場合だけ、プロセス内メモリを使います。本番相当のビルドではメモリへフォールバックせず、未接続ならAPIが`503 storage_unavailable`を返します。

## 共有ストレージ

Vercel MarketplaceのUpstash Redisをプロジェクトへ接続してください。Custom Prefixが`UPSTASH_REDIS_REST`の場合は、統合が自動設定する次の組を最優先で利用します。

```text
UPSTASH_REDIS_REST_KV_REST_API_URL
UPSTASH_REDIS_REST_KV_REST_API_TOKEN
```

Custom Prefixなしの標準名:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

または既存のVercel KV互換名:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

値をソースコードや`NEXT_PUBLIC_*`変数へ入れないでください。

## 主な構成

- `app/online-engine.ts` — 盤面生成、宣言、判定、勝敗を扱う純粋ゲームエンジン
- `app/room-service.ts` — 認証済みの部屋作成・更新とrevision制御
- `app/room-store.ts` — Upstash Redisの24時間TTL・原子的compare-and-set
- `app/room-store-credentials.ts` — Redis環境変数の優先順位と完全なペア選択
- `app/api/rooms/**` — 部屋作成、取得、更新API
- `app/online/**` — オンラインロビー
- `app/room/[roomId]/**` — 自動同期する共有対戦盤面
- `tests/online-engine.test.mjs` — オンラインルールの単体テスト
- `tests/room-store.test.mjs` — Redis環境変数の優先順位とペア選択テスト
- `tests/online-api-e2e.mjs` — ホスト／ゲストのAPI通し試験
