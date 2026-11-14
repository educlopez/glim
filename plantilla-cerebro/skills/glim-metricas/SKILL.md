---
name: glim-metricas
description: >-
  Cómo leer las métricas que Glim guarda en los borradores (metricas_48h y metricas_7d), cómo se
  genera y se lee el informe semanal de informes/ y cómo convertir sus propuestas en aprendizajes
  aprobados. Úsala cuando haya que valorar cómo rindió una pieza, comparar formatos, plantillas u
  horas, preparar el informe de la semana, o cuando la persona apruebe o rechace una propuesta
  de aprendizaje.
version: 1.0.0
---

# Métricas, informe semanal y aprendizajes

Fuente: `server/metricas.js`, `server/reconciliar.js` e `server/informe.js` del repo de Glim.

## Fotos fijas en el borrador

Glim sincroniza Buffer (solo lectura) y, en cada reconciliación, copia las métricas al frontmatter del borrador enlazado:

```
metricas_48h: X: impresiones 1200, reacciones 14, comentarios 3, compartidos 1, engagement 1.50% · tomadas: 2026-11-12T10:04Z
metricas_7d: X: impresiones 2100, reacciones 22, comentarios 4, compartidos 2, engagement 1.33% · Threads: impresiones 300, … · tomadas: 2026-11-17T09:10Z
```

- Cada una solo se toma dentro de su ventana, contada desde que salió la pieza (el primer `sentAt` de Buffer): `metricas_48h` entre las 48 y las 72 h, `metricas_7d` entre los 7 y los 9 días. Una pieza antigua no tiene fotos: no se inventan.
- **Nunca se pisan.** Si un campo ya existe, Glim no lo toca. Tú tampoco: no las edites ni las borres.
- Sin datos no hay foto: una red solo entra si Buffer da impresiones mayores que 0 y refrescó las métricas dentro de la ventana.
- `engagement` es el de Buffer o, si no lo da, (reacciones + comentarios + compartidos) / impresiones.
- Buffer refresca una vez al día: los datos pueden ir hasta ~24 h por detrás de la red.

Para comparar piezas, compara el mismo tramo (48 h con 48 h, 7 días con 7 días).

## Informe semanal

`<rutas.informes>/AAAA-Www.md` (por defecto `informes/`), semana ISO de lunes a domingo. Se genera con:

- el panel: `POST /api/informe { "semana": "2026-W46" }`
- la línea de comandos, desde el repo de Glim: `node server/informe.js --semana 2026-W46 --cerebro /ruta/al/cerebro` (sin `--semana`, la semana anterior; `--salida -` lo imprime sin escribir)

Qué contiene:

1. **Resumen** por red: piezas de la semana, cuántas con métricas y cuántas hay en la base.
2. **Piezas**: cada pieza publicada esa semana frente a la mediana de tus propias piezas de la misma red en las 8 semanas anteriores, y frente a las del mismo formato, plantilla, día de la semana y franja horaria (mañana, mediodía, tarde, noche). Cada celda: mediana, cociente (`1.50x`) y `n`.
3. **Medianas de la base por grupo**: el histórico, sin esta semana.
4. **Propuestas de aprendizaje**: viñetas marcadas **sin aprobar**. Salen de piezas por encima de 1.5x o por debajo de 0.67x la mediana de la red, y de grupos por encima de 1.3x o por debajo de 0.77x, con al menos 3 piezas en la base.

Con `n` pequeño (menos de 3) no saques conclusiones: dilo.

## De propuesta a aprendizaje

El informe **nunca** escribe en el registro de aprendizajes, y un agente tampoco lo hace por su cuenta. La regla de Glim (`SISTEMA` en `server/encargos.js`):

- Solo se escribe en `rutas.aprendizajes` cuando la persona da feedback o rechaza algo. Entonces: entrada nueva arriba, con el formato del registro, y lo que dijo, sin inventar.
- Cualquier otra conclusión es una propuesta: línea `DECISIÓN:` en tu respuesta, o queda en el informe.

Formato de una entrada (el que lee la vista Registro de Glim, `server/registro.js`):

```markdown
### 2026-11-18 · X · Carruseles por la mañana
- Qué pasó: tres carruseles de lunes a las 9:00 sacaron 1.6x la mediana de impresiones (informe 2026-W46).
- Qué aprendimos: en X, el carrusel de mañana funciona mejor que el vídeo a la misma hora.
- Acción: subir a dos carruseles por semana en la cadencia.
```

Para aprobar una propuesta, la persona la pasa al Registro desde el panel o te la da como feedback («apunta que…»). Cita el informe y la semana como fuente en «Qué pasó».
