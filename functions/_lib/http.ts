export const json = (data: unknown, status = 200, extraHeaders?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {}),
    },
  })

export const fail = (
  status: number,
  error: string,
  detail?: string,
) => json({ error, detail }, status)
