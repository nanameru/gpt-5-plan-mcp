# gpt-5-plan MCP Server

このリポジトリは、GPT-5 を使ってプラン作成/実行を行う MCP サーバーです（STDIO）。

## 前提
- Node.js 18+
- OpenAI API Key (`OPENAI_API_KEY`)

## ビルド
```bash
cd /Users/kimurataiyou/new-mcp-server/mcp-server-quickstart
npm i
npm run build
```

## Claude Code への登録（ユーザースコープ・1行コマンド）
以下のコマンドで Claude Code に MCP サーバーを追加できます。
`OPENAI_API_KEY` はあなたの実キーに置き換えてください。

```bash
claude mcp add gpt-5-plan -s user -e OPENAI_API_KEY="sk-REPLACE_ME" -- $(which node) /Users/kimurataiyou/new-mcp-server/mcp-server-quickstart/build/index.js
```

- プロジェクトスコープに追加したい場合は、プロジェクトルートで `-s user` を省略して実行してください。
- 既に同名で登録済みなら、再登録前に削除します:

```bash
claude mcp remove gpt-5-plan
```

## Cursor での利用
プロジェクトローカル設定を使う場合は、リポジトリ直下に `.cursor/mcp.json` を配置します。

```json
{
  "mcpServers": {
    "gpt-5-plan": {
      "command": "node",
      "args": [
        "/Users/kimurataiyou/new-mcp-server/mcp-server-quickstart/build/index.js"
      ],
      "env": {
        "OPENAI_API_KEY": "sk-REPLACE_ME"
      },
      "autoStart": true
    }
  }
}
```

- 反映後、Cursor を再起動します。
- 401 エラー時は `OPENAI_API_KEY` の値と権限、余計な空白/改行がないかをご確認ください。

## 利用できるツール
- `gpt5_plan`: 目標とコンテキストから、JSON 形式の実行可能なプランを生成
- `gpt5_execute`: 受け取ったプラン（JSON/Text）を実行した結果を要約

## トラブルシュート
- 401 認証エラー: `OPENAI_API_KEY` の実値・権限・余計な空白を確認
- Node バージョン: 18+ を推奨（`fetch` 標準サポート）
- 絶対パス必須: `build/index.js` の絶対パスが正しいか確認
- ログ（Claude 系）: `tail -n 50 -f ~/Library/Logs/Claude/mcp*.log`
