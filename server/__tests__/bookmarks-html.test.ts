import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseBookmarksHtml } from '../lib/bookmarks-html.ts'
import { UNCATEGORIZED_GROUP } from '../types.ts'

/** 仿 Chrome「导出书签」的实际结构：所有内容被包在一层 <DL> 里 */
const CHROME_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">书签栏</H3>
    <DL><p>
        <DT><A HREF="https://github.com/" ADD_DATE="1700000000" ICON="data:image/png;base64,iVBOR">GitHub</A>
        <DT><A HREF="https://developer.mozilla.org/" ADD_DATE="1700000000">MDN &amp; 文档</A>
        <DT><H3 ADD_DATE="1700000000">子文件夹</H3>
        <DL><p>
            <DT><A HREF="https://vuejs.org/">Vue.js</A>
        </DL><p>
    </DL><p>
    <DT><H3 ADD_DATE="1700000000">其他书签</H3>
    <DL><p>
        <DT><A HREF="javascript:void(0)">占位书签</A>
        <DT><A HREF="https://nodejs.org/">Node.js</A>
    </DL><p>
</DL><p>
`

describe('parseBookmarksHtml', () => {
  it('顶层文件夹变成分组', () => {
    const groups = parseBookmarksHtml(CHROME_EXPORT)
    assert.deepEqual(
      groups.map((group) => group.name),
      ['书签栏', '其他书签'],
    )
  })

  it('嵌套文件夹合并进最近的顶层分组', () => {
    const groups = parseBookmarksHtml(CHROME_EXPORT)
    const toolbar = groups[0]!
    assert.deepEqual(
      toolbar.bookmarks.map((item) => item.title),
      ['GitHub', 'MDN & 文档', 'Vue.js'],
      '子文件夹里的 Vue.js 应并进「书签栏」，且顺序保持文件里的先后',
    )
  })

  it('解析出的网址已规范化，结尾斜杠被抹平', () => {
    const groups = parseBookmarksHtml(CHROME_EXPORT)
    assert.deepEqual(
      groups[0]!.bookmarks.map((item) => item.url),
      ['https://github.com', 'https://developer.mozilla.org', 'https://vuejs.org'],
    )
  })

  it('HTML 实体在标题里被还原', () => {
    const groups = parseBookmarksHtml(CHROME_EXPORT)
    assert.equal(groups[0]!.bookmarks[1]!.title, 'MDN & 文档')
  })

  it('javascript: 这类占位书签被跳过', () => {
    const groups = parseBookmarksHtml(CHROME_EXPORT)
    const all = groups.flatMap((group) => group.bookmarks)
    assert.ok(!all.some((item) => item.url.startsWith('javascript:')))
  })

  it('没落在任何文件夹里的书签归入未分类', () => {
    const html = `<DL><p>
      <DT><A HREF="https://loose.example.com/">裸书签</A>
      <DT><H3>文件夹</H3>
      <DL><p><DT><A HREF="https://inside.example.com/">内部</A></DL><p>
    </DL><p>`

    const groups = parseBookmarksHtml(html)
    assert.deepEqual(
      groups.map((group) => group.name),
      [UNCATEGORIZED_GROUP, '文件夹'],
    )
    assert.deepEqual(groups[0]!.bookmarks.map((item) => item.title), ['裸书签'])
  })

  it('没有外层 <DL> 包裹时顶层文件夹落在第 0 层也能识别', () => {
    const html = `
      <DT><H3>开发</H3>
      <DL><p>
        <DT><A HREF="https://dev.example.com/">开发站</A>
      </DL><p>`

    const groups = parseBookmarksHtml(html)
    assert.deepEqual(groups.map((group) => group.name), ['开发'])
    assert.equal(groups[0]!.bookmarks[0]!.title, '开发站')
  })

  it('标题为空时退回用网址', () => {
    const html = '<DL><p><DT><A HREF="https://a.example.com/">   </A></DL><p>'
    const groups = parseBookmarksHtml(html)
    assert.equal(groups[0]!.bookmarks[0]!.title, 'https://a.example.com')
  })

  it('空文件返回空数组', () => {
    assert.deepEqual(parseBookmarksHtml(''), [])
    assert.deepEqual(parseBookmarksHtml('<html><body>什么也没有</body></html>'), [])
  })
})
