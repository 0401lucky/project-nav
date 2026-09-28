/** 浏览器偏好不是可信输入；坏数据只让分组回到默认展开，不影响首页。 */
export function parseCollapsedGroups(raw: string | null): string[] {
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((id): id is string => typeof id === 'string')) {
      return []
    }
    return [...new Set(parsed.filter((id) => id !== ''))]
  } catch {
    return []
  }
}
