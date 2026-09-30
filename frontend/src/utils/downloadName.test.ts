import { describe, expect, it } from 'vitest'
import { assetOriginalDownloadName, downloadFileBase } from './downloadName'

describe('downloadName', () => {
  it('用资产卡名称生成下载名，而不是 generation id', () => {
    expect(assetOriginalDownloadName('角色卡-奶龙-06')).toBe('角色卡-奶龙-06-原图')
    expect(assetOriginalDownloadName('  角色卡-阿明-经典九宫格  ')).toBe('角色卡-阿明-经典九宫格-原图')
  })

  it('空名回退 asset，并清洗路径非法字符', () => {
    expect(assetOriginalDownloadName('')).toBe('asset-原图')
    expect(assetOriginalDownloadName(null)).toBe('asset-原图')
    expect(downloadFileBase('a/b:c*d')).toBe('a_b_c_d')
  })
})
