import { fail } from './_lib/http'

export const onRequest: PagesFunction = async (ctx) => {
  try {
    const resp = await ctx.next()
    if (!resp.headers.has('Cache-Control')) {
      const cloned = new Response(resp.body, resp)
      cloned.headers.set('Cache-Control', 'no-store')
      return cloned
    }
    return resp
  } catch (e) {
    return fail(500, '服务异常', (e as Error)?.message)
  }
}
