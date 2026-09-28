# 壁纸扩充接入记录

- 现状：`assets/wallpapers-src/` 保留 8 张 w-01 至 w-04 PNG 原图（已忽略）；`public/wallpapers/manifest.json` 有 8 个条目，每组横竖各一张。
- `server/lib/images.ts` 的 `writeWallpaperVariants` 是原图到 AVIF/WebP 两档和 32px LQIP 的唯一转码逻辑，主档不放大原图且上限 2560px；预算为 300KB。
- `scripts/build-wallpapers.ts` 会删除整个 public/wallpapers 后重建。此次采用一次性接入脚本只调用同一转码函数生成新增 w-05 至 w-08 并扩充 manifest，避免重编码旧资源；无需修改生产转码脚本。
- `server/lib/builtin-wallpapers.ts` 在每次启动时幂等同步 manifest，新条目会入库，旧条目保留；选中项非空时不改 settings.wallpaper。
- `WallpaperPicker.vue` 按 pairId 合成主题按钮，`Wallpaper.vue` 通过 picture/source 自动按方向选择。不需要改 UI。
- 必要源码改动仅 `server/__tests__/wallpapers.test.ts` 的固定 8 张断言（改为 16 张并确认横竖方向各一）、README 的 4 组数量说明，以及生成的 `public/wallpapers/` 新文件和清单。
- 验证：原有资产 hash 不变；所有新增档位尺寸/方向/文件体积正确；壁纸测试、typecheck/build；本地已有数据实例验证新增主题、保留选择、桌面和手机切换。
