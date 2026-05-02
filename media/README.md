# Marketing media

`pnpm capture:demo` 로 자동 생성되는 영상 출력 디렉토리.

산출물:

| 파일                    | 내용                                 |
| :---------------------- | :----------------------------------- |
| `lock-screen.webm`      | sci-fi HUD + 15-language switcher    |
| `charter-issuance.webm` | Lapis vault charter (marquee 차별화) |
| `recovery-flow.webm`    | RecoveryDialog (Forgot passphrase)   |

webm 파일들은 `.gitignore` 됨 (큰 binary, 필요 시 재생성).

Twitter / Product Hunt 용 mp4 변환:

```sh
ffmpeg -i media/lock-screen.webm -c:v libx264 -pix_fmt yuv420p media/lock-screen.mp4
```

3개 클립 concat:

```sh
ffmpeg -i media/lock-screen.webm -i media/charter-issuance.webm -i media/recovery-flow.webm \
  -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]" \
  -map "[out]" media/full-demo.mp4
```
