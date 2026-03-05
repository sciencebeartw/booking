import re

with open('swal_gallery.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the entire <div class="btn-group"> ... </div> block
# Since we know exactly what we want, we can just replace everything from <div class="btn-group"> to the end of the file or the end of the block.

replacement = """    <div class="btn-group">
        <button style="background-color:#2ecc71;" onclick="
            Swal.fire({
                icon: 'success',
                title: '劃位成功',
                html: '<div style=\\'text-align:center; background:#f4f6f7; padding:20px; border-radius:10px; margin-top:15px;\\'><p style=\\'font-size:18px; color:#555; margin-bottom:12px;\\'>訂單編號：<strong style=\\'color:#2c3e50;\\'>123456</strong></p><p style=\\'font-size:20px; color:#555; margin-bottom:5px;\\'>您的座位：</p><p style=\\'font-size:36px; font-weight:bold; color:#e67e22; margin:0 0 15px 0; letter-spacing:2px;\\'>A10</p><p style=\\'font-size:16px; color:#555; margin-bottom:5px;\\'>系統已成功記錄您的報名資料。</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>我們將透過 Line 官方帳號發送「正式通知」。</p><p style=\\'font-size:14px; color:#c0392b; font-weight:bold; margin-bottom:15px;\\'>若尚未加官方 LINE，請點擊右下角Line圖示加入並建檔。<br>註：國中小點綠色「<span style=\\'color:#27ae60;\\'>山熊科學</span>」圖示、高中點藍色「<span style=\\'color:#2980b9;\\'>山熊升大</span>」圖示</p><p style=\\'font-size:20px; text-align:center; color:#c0392b; font-weight:bold; margin-bottom:0; background:#fff3cd; padding:8px 12px; border-radius:8px; border:2px dashed #e67e22;\\'>📸 請務必「截圖」留存此畫面！</p></div>',
                confirmButtonText: '✅ 確定關閉並已截圖',
                confirmButtonColor: '#2ecc71',
                allowOutsideClick: false
            })
        ">劃位成功</button>
        <button style="background-color:#27ae60;" onclick="
            Swal.fire({
                icon: 'success',
                title: '報名成功',
                html: '<div style=\\'text-align:center; background:#f4f6f7; padding:15px; border-radius:10px; margin-top:15px;\\'><p style=\\'font-size:16px; color:#555; margin-bottom:5px;\\'>您的報名時間為：</p><p style=\\'font-size:20px; font-weight:bold; color:#c0392b; margin-top:0; margin-bottom:15px;\\'>2026 / 03 / 06 01:23:45.678</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>系統已成功記錄您的報名資料。</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>報名結果我們將透過 Line 官方帳號發送「正式通知」。</p><p style=\\'font-size:14px; color:#c0392b; font-weight:bold; margin-bottom:15px;\\'>若尚未加官方 LINE<br>請點擊右下角綠色「<span style=\\'color:#27ae60;\\'>山熊科學</span>」圖示加入並建檔。</p><p style=\\'font-size:20px; text-align:center; color:#c0392b; font-weight:bold; margin-bottom:0; background:#fff3cd; padding:8px 12px; border-radius:8px; border:2px dashed #e67e22;\\'>📸 請務必「截圖」留存此畫面！</p></div>',
                confirmButtonText: '✅ 關閉返回',
                confirmButtonColor: '#2ecc71',
                allowOutsideClick: false
            })
        ">單場次模式 (報名成功)</button>
        <button style="background-color:#2980b9;" onclick="
            Swal.fire({
                icon: 'success',
                title: '報名成功',
                html: '<div style=\\'text-align:center; background:#f4f6f7; padding:15px; border-radius:10px; margin-top:15px;\\'><p style=\\'font-size:16px; color:#555; margin-bottom:5px;\\'>您的報名時間為：</p><p style=\\'font-size:20px; font-weight:bold; color:#c0392b; margin-top:0; margin-bottom:15px;\\'>2026 / 03 / 06 01:23:45.678</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>系統已成功記錄您的報名資料。我們將以此進行分發。</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>分發結果我們將透過 Line 官方帳號發送「正式通知」。</p><p style=\\'font-size:14px; color:#c0392b; font-weight:bold; margin-bottom:15px;\\'>若尚未加官方 LINE<br>請點擊右下角綠色「<span style=\\'color:#27ae60;\\'>山熊科學</span>」圖示加入並建檔。</p><p style=\\'font-size:20px; text-align:center; color:#c0392b; font-weight:bold; margin-bottom:0; background:#fff3cd; padding:8px 12px; border-radius:8px; border:2px dashed #e67e22;\\'>📸 請務必「截圖」留存此畫面！</p></div>',
                confirmButtonText: '✅ 關閉返回',
                confirmButtonColor: '#2ecc71',
                allowOutsideClick: false
            })
        ">多梯次志願 (報名成功)</button>
        <button style="background-color:#8e44ad;" onclick="
            Swal.fire({
                icon: 'success',
                title: '報名成功',
                html: '<div style=\\'text-align:center; background:#f4f6f7; padding:15px; border-radius:10px; margin-top:15px;\\'><p style=\\'font-size:16px; color:#555; margin-bottom:5px;\\'>您的報名時間為：</p><p style=\\'font-size:20px; font-weight:bold; color:#c0392b; margin-top:0; margin-bottom:15px;\\'>2026 / 03 / 06 01:23:45.678</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>系統已成功記錄您的報名資料。我們將以此進行分發。</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>分發結果我們將透過 Line 官方帳號發送「正式通知」。</p><p style=\\'font-size:14px; color:#c0392b; font-weight:bold; margin-bottom:15px;\\'>若尚未加官方 LINE<br>請點擊右下角綠色「<span style=\\'color:#27ae60;\\'>山熊科學</span>」圖示加入並建檔。</p><p style=\\'font-size:20px; text-align:center; color:#c0392b; font-weight:bold; margin-bottom:0; background:#fff3cd; padding:8px 12px; border-radius:8px; border:2px dashed #e67e22;\\'>📸 請務必「截圖」留存此畫面！</p></div>',
                confirmButtonText: '✅ 關閉返回',
                confirmButtonColor: '#2ecc71',
                allowOutsideClick: false
            })
        ">雙科配課 (報名成功)</button>
        <button id="btnSwal5" style="background-color:#f39c12;">純候補 (登記成功)</button>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btnSwal5').addEventListener('click', () => {
            Swal.fire({
                html: '<div style=\\'text-align:center; background:#f4f6f7; padding:15px; border-radius:10px; margin-top:15px; font-size:16px;\\'><p style=\\'font-size:20px; font-weight:bold; color:#e67e22; margin-bottom:15px;\\'>候補登記成功</p><p style=\\'font-size:16px; color:#555; margin-bottom:5px;\\'>您的報名時間為：</p><p style=\\'font-size:20px; font-weight:bold; color:#c0392b; margin-top:0; margin-bottom:15px;\\'>2026 / 03 / 06 01:23:45.678</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>系統已成功記錄您的報名資料。</p><p style=\\'font-size:16px; color:#555; margin-bottom:10px;\\'>您本次的候補班級：</p><div style=\\'font-size:18px; font-weight:bold; color:#e74c3c; margin-bottom:15px;\\'>國二物理進階班</div><p style=\\'font-size:15px; color:#e74c3c; margin-bottom:5px;\\'>注意：候補班級目前皆已額滿有候補。</p><p style=\\'font-size:15px; color:#e74c3c; margin-bottom:15px;\\'>本次會依序加入原候補序列後方。</p><p style=\\'font-size:16px; color:#555; margin-bottom:15px;\\'>候補序號我們將透過 Line 官方帳號發送「正式通知」。</p><p style=\\'font-size:14px; color:#c0392b; font-weight:bold; margin-bottom:15px;\\'>若尚未加官方 LINE<br>請點擊右下角綠色「<span style=\\'color:#27ae60;\\'>山熊科學</span>」圖示加入並建檔。</p><p style=\\'font-size:20px; text-align:center; color:#c0392b; font-weight:bold; margin-bottom:0; background:#fff3cd; padding:8px 12px; border-radius:8px; border:2px dashed #e67e22;\\'>📸 請務必「截圖」留存此畫面！</p></div>',
                confirmButtonText: '✅ 關閉返回',
                confirmButtonColor: '#2ecc71',
                allowOutsideClick: false
            })
        });
    });
</script>
</body>
</html>
"""

new_html = re.sub(r'    <div class="btn-group">.*</body>\s*</html>', replacement, html, flags=re.DOTALL)

with open('swal_gallery.html', 'w', encoding='utf-8') as f:
    f.write(new_html)

