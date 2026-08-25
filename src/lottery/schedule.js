const TIMEZONE = "America/Sao_Paulo";

const WEEKDAY_DRAW_TIME = "21:00";
const SUNDAY_DRAW_TIME = "10:00";

const WAIT_AFTER_DRAW_MS = 60 * 60 * 1000;

/**
 * Retorna uma representação da data no fuso de São Paulo.
 */
function getSaoPauloParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }
  );

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/**
 * Cria uma data correspondente ao horário informado
 * usando o timezone de São Paulo.
 */
function createDateFromParts(
  year,
  month,
  day,
  hour,
  minute = 0,
  second = 0
) {
  const utc = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    )
  );

  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: TIMEZONE,
      timeZoneName: "longOffset"
    }
  );

  const parts = formatter.formatToParts(utc);

  const offset = parts.find(
    (part) => part.type === "timeZoneName"
  )?.value;

  if (!offset) {
    throw new Error(
      "Não foi possível determinar o timezone."
    );
  }

  const match = offset.match(
    /GMT([+-])(\d{2}):?(\d{2})/
  );

  if (!match) {
    throw new Error(
      `Offset de timezone inválido: ${offset}`
    );
  }

  const sign = match[1] === "+" ? 1 : -1;
  const offsetMinutes =
    sign *
    (
      Number(match[2]) * 60 +
      Number(match[3])
    );

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      second
    ) -
      offsetMinutes * 60 * 1000
  );
}

/**
 * Retorna o próximo sorteio a partir de uma data.
 *
 * Segunda a sexta: 21:00
 * Sábado: sem sorteio
 * Domingo: 10:00
 */
export function getNextDrawDate(
  fromDate = new Date()
) {
  const parts =
    getSaoPauloParts(fromDate);

  const current = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day
    )
  );

  for (let i = 0; i < 8; i++) {
    const candidate = new Date(current);
    candidate.setUTCDate(
      candidate.getUTCDate() + i
    );

    const dayOfWeek =
      candidate.getUTCDay();

    if (dayOfWeek === 6) {
      continue;
    }

    const isSunday =
      dayOfWeek === 0;

    const [hour, minute] = (
      isSunday
        ? SUNDAY_DRAW_TIME
        : WEEKDAY_DRAW_TIME
    )
      .split(":")
      .map(Number);

    const drawDate = createDateFromParts(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth() + 1,
      candidate.getUTCDate(),
      hour,
      minute
    );

    if (drawDate > fromDate) {
      return drawDate;
    }
  }

  throw new Error(
    "Não foi possível calcular o próximo sorteio."
  );
}

/**
 * Retorna a data/hora a partir da qual o resultado
 * pode ser considerado possivelmente disponível.
 *
 * Regra:
 * horário do sorteio + 1 hora.
 */
export function getNextCheckDate(
  fromDate = new Date()
) {
  const nextDraw =
    getNextDrawDate(fromDate);

  return new Date(
    nextDraw.getTime() +
    WAIT_AFTER_DRAW_MS
  );
}


/**
 * Calcula o tempo, em segundos, durante o qual
 * o resultado atual pode permanecer em cache.
 *
 * O cache expira uma hora após o próximo sorteio.
 */
export function getCacheTTL(
  fromDate = new Date()
) {
  const nextCheck =
    getNextCheckDate(fromDate);

  const diff =
    nextCheck.getTime() -
    fromDate.getTime();

  return Math.max(
    0,
    Math.floor(diff / 1000)
  );
}

/**
 * Converte DD/MM/YYYY para uma data de sorteio.
 */
export function parseDrawDate(
  dateString,
  drawTime
) {
  if (
    typeof dateString !== "string" ||
    typeof drawTime !== "string"
  ) {
    return null;
  }

  const dateMatch =
    dateString.match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

  const timeMatch =
    drawTime.match(
      /^(\d{2}):(\d{2})$/
    );

  if (!dateMatch || !timeMatch) {
    return null;
  }

  return createDateFromParts(
    Number(dateMatch[3]),
    Number(dateMatch[2]),
    Number(dateMatch[1]),
    Number(timeMatch[1]),
    Number(timeMatch[2])
  );
}

/**
 * Verifica se já passou uma hora do horário
 * previsto para o próximo sorteio.
 */
export function shouldCheckLottery(
  metadata,
  now = new Date()
) {
  if (!metadata) {
    return false;
  }

  const drawDate =
    parseDrawDate(
      metadata.nextDrawDate,
      metadata.drawTime
    );

  if (!drawDate) {
    console.warn(
      `[SCHEDULE] Data de sorteio inválida para ${metadata.id}.`
    );

    return false;
  }

  const checkAfter =
    drawDate.getTime() +
    WAIT_AFTER_DRAW_MS;

  return now.getTime() >= checkAfter;
}