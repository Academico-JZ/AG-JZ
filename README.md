# AG-JZ

🚀 **CLI global para unificar múltiplos kits Antigravity**

## O que faz?

Este pacote NPM permite sincronizar múltiplos repositórios de kits (como `gemini-superpowers-antigravity`, `antigravity-kit`, etc.) em um único diretório global do Antigravity.

**Diferente de outros instaladores**, o `ag-jz`:
- ✅ **Mescla** múltiplos repos (não sobrescreve)
- ✅ Instala no **diretório global** (`~/.gemini/antigravity/.agent`)
- ✅ Cria **symlinks** para workspaces locais
- ✅ Usa `giget` para downloads rápidos (sem git clone completo)

## Instalação

```bash
npm install -g @academico-jz/ag-jz
```

## Uso

### Sincronizar um repositório

```bash
ag-jz sync github:anthonylee991/gemini-superpowers-antigravity
```

### Sincronizar todos os kits predefinidos

```bash
ag-jz sync --all
```

### Criar link simbólico no workspace atual

```bash
ag-jz link
```

### Ver status dos kits instalados

```bash
ag-jz status
```

## Arquitetura

```
~/.gemini/antigravity/.agent/
├── workflows/
│   ├── superpowers-write-plan.md    (repo A)
│   ├── awesome-debug.md             (repo B)
│   └── custom-workflow.md           (repo C)
├── skills/
│   ├── superpowers-tdd/             (repo A)
│   ├── awesome-security/            (repo B)
│   └── custom-skill/                (repo C)
└── .sync-registry.json              (rastreamento)
```

## Inspiração

Baseado na engenharia reversa do [`@vudovn/ag-kit`](https://www.npmjs.com/package/@vudovn/ag-kit), mas adaptado para merge inteligente de múltiplos repositórios.

## Licença

MIT
