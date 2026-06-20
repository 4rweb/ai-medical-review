# AI Medical Review — Pré-triagem inteligente para salas de emergência

## 💡 Inspiração

Quem já passou por um pronto-socorro no Brasil conhece a cena: você chega com febre, dor de cabeça, talvez uma dor no peito que não sabe explicar — e senta numa fila sem saber se vai esperar dez minutos ou quatro horas. Lá na frente, um enfermeiro precisa olhar para cada pessoa, medir sinais vitais, ouvir sintomas e decidir, em poucos minutos, qual pulseira colorida você recebe.

Esse processo tem nome: **Protocolo de Manchester**, obrigatório por lei em todos os serviços de urgência do país desde 2008. Ele classifica os pacientes em cinco cores — **vermelho** (emergência, atendimento imediato), **laranja** (muito urgente, 10 min), **amarelo** (urgente, 60 min), **verde** (pouco urgente, 120 min) e **azul** (não urgente, 240 min). Funciona. Mas tem um gargalo: tudo começa *depois* que o paciente já chegou e entrou na fila. A classificação acontece na hora, presencialmente, e cada triagem consome o tempo de um profissional escasso.

A pergunta que originou o **AI Medical Review** foi simples:

> E se a triagem começasse *antes* do paciente cruzar a porta do hospital?

Enquanto a pessoa está a caminho — no carro, no ônibus, na sala de espera — ela poderia descrever o que sente pelo celular. Quando chegasse, o sistema já teria uma **pré-classificação de risco** pronta, os dados organizados, e o enfermeiro só precisaria confirmar o que importa (aferir a febre, checar a pressão) em vez de coletar tudo do zero. Menos tempo na fila para quem está em risco. Menos sobrecarga para a equipe. É essa pré-triagem que o AI Medical Review entrega.

## 🩺 O que ele faz

O AI Medical Review é um **agente de pré-triagem** que conversa com o paciente e produz uma classificação de risco no estilo Manchester — sempre como **apoio à decisão clínica, nunca como diagnóstico**.

**Para o paciente** — um fluxo conversacional, rápido e amigável (pensado para o celular):

- Descreve o motivo da visita em linguagem natural.
- Seleciona sintomas em uma grade visual (febre, dor no peito, falta de ar, dor abdominal...) ou digita os seus.
- Informa o nível de dor numa escala de 0 a 10.
- Opcionalmente, registra sinais vitais que conheça (frequência cardíaca, pressão, temperatura, SpO₂).
- Revisa e edita um resumo antes de enviar — um **checkpoint human-in-the-loop** intencional.

Esses dados vão para o modelo **Qwen, rodando na Alibaba Cloud**, que **raciocina sobre o conjunto** (sintomas + dor + sinais vitais + tempo de evolução) e devolve: a cor de prioridade, o tempo estimado de espera, recomendações e flags de alerta. Sinais críticos disparam um aviso de **"possível emergência — procure atendimento imediato"** já durante o preenchimento.

**Para a equipe de saúde** — um **Painel Administrativo** em tempo real que mostra as triagens chegando, ordenadas por prioridade, com métricas (volume do dia, tempo médio, precisão na identificação de emergências, casos em processamento). O hospital ganha visibilidade de *quem precisa ser atendido primeiro* antes mesmo de a pessoa chegar.

É um **loop fechado**: paciente → agente → classificação → painel da equipe.

## 🛠️ Como construímos

A arquitetura separa claramente as responsabilidades:

- **Frontend** — interface conversacional responsiva, otimizada para mobile, com tema claro/escuro e os componentes de coleta (grade de sintomas, sliders de dor e sinais vitais, tela de revisão editável).
- **Camada de agente (Qwen / Alibaba Cloud)** — o núcleo do projeto. Em vez de regras `if/else`, o raciocínio de classificação é delegado ao Qwen, usando a API compatível com OpenAI da Qwen Cloud (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`). O agente:
  - interpreta entradas ambíguas (texto livre do paciente),
  - pondera múltiplos fatores clínicos de forma estruturada,
  - **justifica** a prioridade atribuída (explicabilidade, não caixa-preta),
  - aciona ferramentas externas (*function calling*) para tarefas como verificar disponibilidade de consultório e estimar o tempo de espera.
- **Backend na Alibaba Cloud** — orquestra as chamadas, persiste as triagens e alimenta o painel em tempo real.

> 🎯 **Track escolhido: Autopilot Agent (Track 4).** O AI Medical Review automatiza um fluxo de negócio real de ponta a ponta, lida com entradas ambíguas, invoca ferramentas externas e mantém checkpoints de revisão humana nos pontos críticos — exatamente o que a categoria valoriza, com foco em prontidão para produção e não em demo de brinquedo.

## 🧗 Desafios

- **Segurança em primeiro lugar.** Construir algo na área da saúde exige uma linha clara: isto é **pré-triagem e orientação**, não diagnóstico. Desenhar avisos, disclaimers e a escalada para "procure atendimento imediato" foi tão importante quanto a classificação em si.
- **Sair do "wizard" e virar "agente".** O risco era entregar um formulário em etapas disfarçado de IA. A virada foi mover a lógica de classificação para o raciocínio do Qwen, com justificativa e *function calling* reais.
- **Fidelidade ao Protocolo de Manchester.** Mapear cores, tempos e discriminadores para um modelo de linguagem, sem inventar gravidade nem subestimar emergências, exigiu calibrar prompts e validar os casos-limite (a dor de cabeça que é enxaqueca *vs.* a que é um AVC).
- **Prova de deploy na Alibaba Cloud.** Garantir que o backend e as chamadas ao Qwen realmente rodassem na infraestrutura Alibaba — e fossem demonstráveis — foi um requisito estrutural desde o primeiro dia.

## 📚 O que aprendemos

- Que a parte difícil de um agente de saúde **não é o modelo, é o fluxo** — onde colocar o humano de volta no circuito, como comunicar incerteza, quando gritar "vá ao hospital agora".
- Como transformar um protocolo clínico consolidado (Manchester) em um sistema de raciocínio explicável, em vez de um classificador opaco.
- Como tirar o máximo da Qwen Cloud com a API compatível com OpenAI, *function calling* e orquestração de agentes na infraestrutura da Alibaba Cloud.

## 🚀 Próximos passos

- Refinar significativamente a tela de triagem para torná-la ainda mais rápida e simples de preencher.
- Dividir a lógica em **sub-agentes especializados** (coletor de sintomas → classificador de risco → agendador), reforçando a arquitetura multiagente.
- Integração via **MCP** para conectar o agente a sistemas hospitalares reais.
- Acessibilidade e suporte a múltiplos idiomas, para alcançar mais pacientes.

---

> ⚠️ **Aviso:** O AI Medical Review é uma ferramenta de **pré-triagem e apoio à decisão**. Não substitui avaliação médica nem fornece diagnóstico. Em caso de emergência, procure atendimento imediato.
