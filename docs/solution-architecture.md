# Cifron AI Solution Architecture

```text
edges.parquet + nodes.parquet + transactions.parquet
                         |
                    validation
                         |
              graph metrics and centrality
                         |
             explainable roles and scores
                         |
                 reproducible clusters
                         |
          nodes_roles.csv / clusters.csv / top_nodes.csv
                         |
                  local Next.js UI
                         |
              optional OpenAI node assistant
```

Весь базовый pipeline выполняется локально на CPU без внешних API, GPU и облачного кластера. Он валидирует три Parquet-файла, добавляет узлы без рёбер, считает направленные и кластерные метрики, назначает роль по формальным percentile-порогам и создаёт три CSV.

Базовые роли объяснимы: coordinator использует degree centrality как proxy, priority и связь с seed; distributor — высокий исходящий degree; consolidator — высокий входящий degree; transit — observed pass-through ratio 0.8–1.2 у не-seed; terminal — отсутствие исходящих при depth ниже 4; остальные получают peripheral. Узлы depth=4 без исходящих не считаются terminal автоматически.

Next.js UI и demo-режим остаются отдельным интерфейсным слоем. AI-анализ узла опционален, не участвует в расчёте базовых ролей или score и формулирует только гипотезы для ручной проверки; без API-ключа работает локальный fallback.
