import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseCollapsedGroups } from './groupCollapse.ts'

describe('分组折叠偏好解析', () => {
  it('首次使用、损坏 JSON 和非数组回到默认展开', () => {
    for (const raw of [null, '', '{broken', 'null', '{}', 'true', '42', '"group-a"']) {
      assert.deepEqual(parseCollapsedGroups(raw), [], `无效偏好 ${raw} 不能阻止启动`)
    }
  })

  it('拒绝混合类型，不把非字符串转换为分组 id', () => {
    for (const raw of ['["a",1]', '["a",null]', '["a",{}]', '["a",["b"]]']) {
      assert.deepEqual(parseCollapsedGroups(raw), [])
    }
  })

  it('保留稳定 id，去重并忽略空字符串', () => {
    assert.deepEqual(parseCollapsedGroups('["group-b","group-a","group-b","", "分组-c"]'), [
      'group-b', 'group-a', '分组-c',
    ])
    assert.deepEqual(parseCollapsedGroups('[]'), [])
  })
})
