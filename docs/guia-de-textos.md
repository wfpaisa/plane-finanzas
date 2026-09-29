# Guía de textos de la interfaz

Todo texto que vea la persona (títulos, etiquetas, ayudas, placeholders, botones, tooltips, estados vacíos, errores, confirmaciones y notificaciones) sigue esta guía, en escritorio y en móvil.

Cada texto debe permitir entender, sin contexto adicional:

1. Qué está viendo la persona.
2. Qué acción puede realizar.
3. Qué ocurrirá después.
4. Qué debe corregir si hay un problema.

## Estilo general

- Escribe en español neutro, natural y correcto.
- Usa palabras comunes y frases cortas.
- Expresa una sola idea por oración.
- Usa voz activa y verbos directos.
- Mantén un tono humano, sobrio y práctico.
- Respeta siempre las tildes, la puntuación y los nombres del producto.
- Redacta directamente en español; no traduzcas literalmente estructuras del inglés.
- Evita tecnicismos, anglicismos, lenguaje interno del sistema y conceptos que el usuario no conozca.
- No uses expresiones vagas como “toca”, “aplica”, “esto”, “aquello” o “realizar la operación” sin explicar a qué se refieren.
- No atribuyas acciones a una IA. Explica lo que hará la aplicación.

## Claridad y contexto

Cada texto debe poder entenderse de forma aislada. Antes de escribirlo, identifica:

- Quién lo leerá.
- En qué pantalla o momento aparecerá.
- Qué dato debe ingresar o qué decisión debe tomar.
- Qué consecuencia tendrá la acción.

Si una frase admite más de una interpretación, reescríbela. No sacrifiques precisión por brevedad.

Incorrecto: “Mes del año que toca.”

Correcto:

- Etiqueta: “Mes del pago”
- Ayuda: “Mes del año en que debes hacer este pago.”

Adapta el texto al tipo de movimiento:

- Ingreso: “Mes del año en que esperas recibirlo.”
- Gasto: “Mes del año en que debes pagarlo.”
- Transferencia: “Mes del año en que harás la transferencia.”

## Terminología del producto

Usa siempre el mismo término para el mismo concepto:

- “Movimiento programado”: ingresos, gastos o transferencias que se repiten o se planifican.
- “Ingreso programado”, “pago programado” y “transferencia programada”: cuando se conozca el tipo.
- “Registrar”: crear un movimiento en la aplicación.
- “Reservar dinero”: identificar dinero destinado a un pago futuro.
- “Registro automático”: la aplicación crea el movimiento en una fecha determinada.
- “En pausa”: una programación temporalmente desactivada.
- “Monto”: la cantidad de dinero.
- “Cuenta de origen” y “cuenta de destino”: en transferencias.

Evita alternar sin motivo entre “recurrente”, “fijo”, “programado”, “apartado” y “reservado”. En los textos para el usuario prefiere “programado” y “reservado”. Los términos técnicos pueden conservarse solo en el código interno (nombres de variables, colecciones, comentarios).

## Componentes de interfaz

### Títulos

Nombran claramente el contenido o la acción: “Editar gasto programado”, “Movimientos programados”, “Dinero por reservar”.

Evita títulos genéricos como “Editar”, “Información” o “Configuración” cuando se pueda indicar el objeto.

### Campos

La etiqueta dice qué dato se solicita. La ayuda (tooltip, prop `tip` de `Field`) explica cómo elegirlo o qué efecto tendrá. No repitas la etiqueta en la ayuda.

- Etiqueta: “Día del mes (opcional)”
- Ayuda: “Día en que debes hacer el pago. Si no eliges uno, podrás registrarlo en cualquier fecha.”

### Botones

Usa un verbo y el objeto cuando sea necesario: “Guardar cambios”, “Crear programación”, “Programar ingreso”, “Eliminar programación”.

Evita botones vagos como “Aceptar”, “Continuar” o “Sí” cuando pueda nombrarse la acción.

### Estados vacíos

Explica qué falta y ofrece el siguiente paso: “Aún no hay pagos programados. Agrega servicios, cuotas u otros pagos habituales.”

Evita dejar solo ejemplos sueltos como “Crédito, servicios, administración…”.

### Errores

Indica qué falta o falló y cómo resolverlo: “Elige una cuenta de destino distinta.”

Evita mensajes genéricos como “Datos inválidos” u “Ocurrió un error”.

### Confirmaciones y acciones destructivas

Indica qué se eliminará, qué información se conservará y si la acción puede deshacerse.

### Textos de ayuda

Incluye solo información que permita tomar una decisión o evitar un error. Explica las consecuencias reales de activar una opción.

Ejemplo: “La aplicación creará este movimiento según la frecuencia y la fecha indicadas. No hará operaciones en tu banco.”

## Revisión obligatoria

Antes de entregar cualquier interfaz:

1. Revisa títulos, subtítulos, etiquetas, ayudas, placeholders, botones, tooltips, estados vacíos, errores, confirmaciones y notificaciones.
2. Comprueba que el mismo concepto tenga el mismo nombre en escritorio y móvil.
3. Busca frases ambiguas, traducciones literales, palabras sin tilde y mensajes que dependan de contexto oculto.
4. Verifica que los textos cambien correctamente según se trate de un ingreso, gasto o transferencia.
5. Lee cada texto de forma aislada y confirma que siga siendo comprensible.
6. Corrige directamente todos los textos deficientes; no te limites a señalar los problemas.
7. Conserva intacta la lógica de negocio salvo que el cambio de texto requiera una adaptación explícita de la interfaz.
