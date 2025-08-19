---
title: "Claude CodeでGPT-5が使えるMCPを作った件"
emoji: "🤖"
type: "tech"
topics: ["mcp", "claude", "gpt5", "openai", "cursor"]
published: false
---

## 概要

このリポジトリは、Claude Code（および Cursor）から利用できる MCP(Server) を実装し、GPT-5 を用いた日本語の開発計画生成ツール（`gpt5_plan`）を提供します。シンプルな環境変数の設定で、Claude のチャットから直接、要件に基づく計画の YAML を生成できます。

## できること

- GPT-5 を使って、要件から日本語の YAML 仕様に沿った開発計画を自動生成
- Claude Code のチャットから `gpt5_plan` ツールを呼び出して、計画の雛形をすぐ取得
- 出力の詳細度（`OPENAI_TEXT_VERBOSITY`）やモデル（`OPENAI_MODEL`）を環境変数で調整
- Cursor の `.cursor/mcp.json` に追加して、プロジェクトローカルでも利用可能

## セットアップ（Claude Code）

以下のコマンドで MCP サーバーを追加します。`OPENAI_API_KEY` とパスは環境に合わせて置き換えてください。

```bash
claude mcp add gpt-5-plan -s user \
  -e OPENAI_API_KEY="sk-REPLACE_ME" \
  -e OPENAI_MODEL="gpt-5" \
  -e OPENAI_REASONING_EFFORT="high" \
  -e OPENAI_TEXT_VERBOSITY="low" \
  -- $(which node) /Users/kimurataiyou/gpt-5-plan-mcp/build/index.js
```

プロジェクトスコープで使いたい場合は、プロジェクトルートで `-s user` を省いて同様に実行します。削除は次で可能です：

```bash
claude mcp remove gpt-5-plan
```

## Cursor への追加（任意）

プロジェクトローカルに `.cursor/mcp.json` を配置します。

```json
{
  "mcpServers": {
    "gpt-5-plan": {
      "command": "node",
      "args": [
        "/Users/kimurataiyou/gpt-5-plan-mcp/build/index.js"
      ],
      "env": {
        "OPENAI_API_KEY": "sk-REPLACE_ME",
        "OPENAI_MODEL": "gpt-5",
        "OPENAI_REASONING_EFFORT": "medium",
        "OPENAI_TEXT_VERBOSITY": "low"
      },
      "autoStart": true
    }
  }
}
```

## 使い方の流れ

1. 上記の手順で MCP サーバーを追加
2. Claude Code のチャットから `gpt5_plan` ツールを実行
3. 要件（目的、制約、優先度など）を与えると、日本語 YAML の計画が返ります

例）「この機能の開発計画を日本語 YAML で作って。制約は〜、優先度は〜」のように指示します。

## 設定できる環境変数

- `OPENAI_MODEL`（既定: `gpt-5`）
- `OPENAI_TEXT_VERBOSITY`（`low` | `medium` | `high`、既定: `low`）
- `OPENAI_BASE_URL`（任意・互換プロキシを使う場合）
- `OPENAI_REASONING_EFFORT`（`low` | `medium` | `high`、既定: `medium`）

注記：現状 `gpt5_plan` では推論強度は固定（`medium`）のため、`OPENAI_REASONING_EFFORT` は影響しません（必要なら `src/index.ts` の固定値を外してください）。

## 開発メモ（MCP/Node/STDIO）

- STDIO ベースの MCP では `stdout` への任意出力は JSON-RPC を壊すため避ける
- ログは `stderr` or ファイルへ出力
- Node は 18+ 推奨（ネイティブ `fetch`）
- Claude の MCP ログ確認：`tail -n 50 -f ~/Library/Logs/Claude/mcp*.log`

参考: [MCP Quickstart（Node）](https://modelcontextprotocol.io/quickstart/server#node)

---

短時間で「具体的な日本語の開発計画」を下敷きに議論や実装を進めたいときに便利です。Claude/Cursor の作業文脈に密接に接続できるのが MCP の強みで、モデルや出力粒度も環境変数で柔軟に切り替えられます。

