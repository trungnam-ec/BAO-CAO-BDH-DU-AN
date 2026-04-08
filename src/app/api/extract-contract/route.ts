import { NextResponse } from 'next/server';
import OpenAI from 'openai';



export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const apiKey = request.headers.get('x-api-key');
        const modelFromHeader = request.headers.get('x-model');
        const modelFromForm = formData.get('model') as string;
        const overrideModel = modelFromHeader || modelFromForm || 'gpt-4o';
        const fileNameFromForm = formData.get('filename') as string;
        const fileName = fileNameFromForm || (file ? file.name : "Không rõ tên file");

        if (!apiKey) {
            return NextResponse.json({ error: 'Thieu API key. Vao Settings de cau hinh.' }, { status: 400 });
        }

        const openai = new OpenAI({ apiKey });

        // -- 1. Trich xuat text bang pdf2json --
        let extractedText = "";
        if (file) {
            try {
                const PDFParser = (await import('pdf2json')).default;
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                extractedText = await new Promise<string>((resolve, reject) => {
                    const pdfParser = new PDFParser(null, true);
                    pdfParser.on("pdfParser_dataError", (errData: any) =>
                        reject(new Error(errData.parserError?.message || "PDF parse failed"))
                    );
                    pdfParser.on("pdfParser_dataReady", () => {
                        resolve(pdfParser.getRawTextContent());
                    });
                    pdfParser.parseBuffer(buffer);
                });
                console.log(`pdf2json trich duoc ${extractedText.length} ky tu`);
            } catch (parseErr) {
                console.warn("pdf2json failed:", parseErr);
            }
        }

        // -- 2. Nhan anh tu Client (neu co) --
        let hasImages = false;
        const pageImages: string[] = [];
        const totalPages = parseInt((formData.get("total_pages_sent") as string) || "0");

        for (let i = 1; i <= totalPages; i++) {
            const imgBase64 = formData.get(`image_page_${i}`) as string;
            if (imgBase64) {
                pageImages.push(imgBase64);
                hasImages = true;
            }
        }

        if (!extractedText && !hasImages) {
            return NextResponse.json({ error: 'Khong tim thay noi dung PDF hoac anh.' }, { status: 400 });
        }

        // -- 3. System Prompt --
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        const systemPrompt = `Ban la chuyen gia doc BAO CAO TIEN DO THI CONG HANG NGAY cua cong ty xay dung Viet Nam (TNEC / TRUNG NAM E&C).
Nhiem vu: Trich xuat CHINH XAC cac thong tin tu bao cao ngay thi cong. THOI GIAN HIEN TAI (LUC UPLOAD BAC CAO NAY) LA THANG ${currentMonth} NAM ${currentYear}.

TÊN FILE PDF ĐANG XỬ LÝ: "${fileName}"

MAU BAO CAO CO CAU TRUC:
- Tieu de: "BAO CAO NGAY" + ngay thang nam o giua trang
- Ben phai: bang gia tri hop dong, San luong (so tien + %), Gia tri con lai (%)
- Giua trang: danh sach Cong viec thuc hien ngay (STT 1, 2, 3...)
- Cuoi trang: Vuong mac, Kien nghi

CAC TRUONG CAN TRICH XUAT:

1. "ngayBaoCao": Ngày của báo cáo này (BẮT BUỘC PHẢI CÓ).
   - VỊ TRÍ ƯU TIÊN 1: Đọc từ TÊN FILE PDF ("${fileName}") trước tiên. Nếu tên file có chứa ngày tháng (Ví dụ: "BÁO CÁO NGÀY_04.4.2026.pdf" -> 04/04/2026), hãy lấy ngay ngày đó làm kết quả.
   - VỊ TRÍ ƯU TIÊN 2: Nếu tên file không có ngày, tìm trong văn bản chỗ nào có chữ "BÁO CÁO NGÀY", ngày tháng báo cáo sẽ nằm ngay cạnh hoặc phía dưới dòng chữ đó.
   - VỊ TRÍ ƯU TIÊN 3: Dòng chứa cụm từ "Công việc thực hiện ngày: ..." hoặc "Ngày báo cáo: ...".
   - VỊ TRÍ ƯU TIÊN 4: Bất kỳ chỗ nào có định dạng ngày tháng năm (d/m/y) ở 1/3 đầu trang.
   - LƯU Ý QUAN TRỌNG: Ngày tháng có thể bị lỗi OCR thành "5 / 4 / 2026", hãy thông minh ghép lại.
   - LƯU Ý VỀ ĐẢO LỘN: BẮT BUỘC dựa vào tháng hiện tại là THÁNG ${currentMonth} NĂM ${currentYear}.
     * Ví dụ: Nếu thấy "4/5/2026" mà hiện tại là tháng 4, thì đó là ngày 5 tháng 4. AI phải ưu tiên chọn ngày gần với hôm nay nhất.
   - Định dạng kết quả TRẢ VỀ: DD/MM/YYYY (Ví dụ: "04/04/2026"). Không được để trống.

2. "tenDuAn": Ten du an / cong trinh - LAY DAY DU, CHINH XAC.
   - Tim o truong "Du an:" trong phan thong tin du an o dau trang PDF (o header hoac phan mo dau)
   - Vi du trong PDF: "Du an: Nha may dien mat troi Tra Vinh - Giai doan 2" → lay "Nha may dien mat troi Tra Vinh - Giai doan 2"
   - KHONG rut gon, KHONG viet tat (KHONG lay "Tra Vinh", KHONG lay "XLNT" thay cho ten day du)
   - Giu nguyen ky tu dac biet, dau gach ngang, so thu tu giai doan
   - Neu khong tim thay truong "Du an:" -> lay ten o tieu de bao cao (dong dau trang)
   - QUAN TRONG: Cung 1 du an phai cho ra CUNG 1 TEN giong het nhau qua moi ngay bao cao

3. "lkHomNay": % San luong LUY KE den HOM NAY (TUYET DOI QUAN TRONG).
   - TH1: PDF co cot % -> Lay truc tiep tu o % cua dong "San luong". VD: "28.61%".
   - TH2: PDF KHONG CO COT % (Dự án Thường Phước) -> AI BAT BUOC TU TINH:
     + Cong thuc: lkHomNay = (San luong tam tinh / Gia tri Hop dong) * 100
     + Ví dụ: San luong 1,301,167,585 và GT Hợp đồng 95,092,891,627
     + -> (1301167585 / 95092891627) * 100 = 1.368% -> Tra ve "1.368%"
   - Neu San luong = 0 hoac "-" -> "0%"
 
4. "homNayPercent": % tien do THI CONG THEM trong ngay hom nay (delta trong ngay).
   - Tim: "Tien do hom nay:", "% thuc hien ngay:", "Delta:", hoac truong tien do rieng
   - Day chi la phan tang THEM trong ngay (khong phai luy ke)
   - Neu khong thay ro -> "0%"
 
5. "gtHopDong": Gia tri hop dong (ty dong) - CO DINH.
   - Tim o dóng "Gia tri Hop dong" trong bảng hoac DOC TỪ ĐỈNH CỘT TRONG BIỂU ĐỒ SẢN LƯỢNG.
   - HUONG DAN CHUYEN DOI SANG TY DONG (Bat Buoc):
     + Buoc 1: Lay day du day so (VD: 95,092,891,627 hoac 568,791,724,932).
     + Buoc 2: Loai bo ky tu phan cach để lay so nguyen (VD: 95092891627).
     + Buoc 3: CHIA cho 1,000,000,000 de ra ty dong. Lay 3 so thap phan.
     + VD 1: 568,791,724,932 -> chia 1 ty -> 568.792
     + VD 2: 95,092,891,627 -> chia 1 ty -> 95.093
   - YEU CAU: KHONG DUOC DE TRONG, phai ra so.
 
6. "gtSanLuong": Gia tri san luong (ty dong).
   - Tim o "San luong tam tinh" hoac DOC TỪ ĐỈNH CỘT THỨ 2 TRONG BIỂU ĐỒ SẢN LƯỢNG.
   - CHUYEN DOI TUONG TU SANG TY DONG: Chia cho 1,000,000,000.
   - VD 1: 14,466,933,782 -> chia 1 ty -> 14.467
   - VD 2: 1,301,167,585  -> chia 1 ty -> 1.301
   - Neu bang "-" hoac trong -> "0"
 
7. "gtConLai": Gia tri con lai (ty dong).
   - Tim o dong "Gia tri con lai" hoac DOC TỪ ĐỈNH CỘT THỨ 3 TRONG BIỂU ĐỒ.
   - Chuyen doi chia 1 ty: VD: 554,324,791,150 -> 554.325 | 93,791,724,042 -> 93.792
   - Neu khong co -> "N/A"

8. "gtNghiemThu": Gia tri nghiem thu (ty dong).
   - Tim: "Nghiem thu:", "Gia tri NT:", "GT NT:"
   - Neu khong co -> "N/A"

9. "congViecTrongNgay": Danh sach cong viec THUC HIEN trong ngay (KHONG phai ke hoach, KHONG phai phuong thuc).
   - Tim chinh xac section co tieu de: "Cong viec thuc hien ngay:", "Cong viec thuc hien trong ngay:", "KL thuc hien:", kem theo ngay bao cao
   - Doc TOAN BO cac dong ben duoi section do, bao gom:
     + Cac dong bat dau bang "**" (hang muc chinh)
     + Cac dong bat dau bang "+" hoac "-" (chi tiet thuc hien)
     + Cac so thu tu 1., 2., 3. (neu co)
   - Vi du dung (tu PDF):
     ** Hang muc: Che tao coc be tong cot thep
     + Gia cong lap dung cot thep, van khuon coc be tong cot thep;
     + Bao duong coc be tong cot thep;
     + Nghiem thu van khuon va thep coc truoc khi do be tong
     + Do be tong coc 220x220x3900mm
     + Thi cong kho bai chua pin
   - TUYET DOI KHONG lay tu cac section: "Phuong thuc:", "Ke hoach:", "Ghi chu:", "Ton tai:", "Kien nghi:"
   - Giu nguyen toan bo noi dung, KHONG rut gon, KHONG bo sot, KHONG them noi dung ngoai PDF
   - Phan cach giua cac dong bang ky tu xuong dong \n

9. "vuongMac": Vuong mac, kho khan, kien nghi.
   - Tim phan "Vuong mac:", "Kien nghi:", "Ton tai:" o cuoi bao cao
   - Neu khong co -> "Khong co"

QUY TAC BAT BUOC:
- Tra ve JSON hop le.
- So lieu chinh xac tuyet doi.
- Giu nguyen tieng Viet co dau.
- gtHopDong, gtSanLuong, gtNghiemThu luon la so ty dong (khong co chu "ty").
- lkHomQua va homNayPercent la % (co ky hieu %).

JSON BAT BUOC (tra ve DUNG cau truc nay):
{
  "data": {
    "ngayBaoCao": "DD/MM/YYYY",
    "tenDuAn": "...",
    "lkHomNay": "X.XX%",
    "homNayPercent": "X.XX%",
    "gtHopDong": "XXX.XXX",
    "gtSanLuong": "XX.XXX",
    "gtConLai": "XX.XXX",
    "gtNghiemThu": "XX.XXX hoac N/A",
    "congViecTrongNgay": "...",
    "vuongMac": "..."
  },
  "validationScores": {
    "ngayBaoCao": 0,
    "tenDuAn": 0,
    "lkHomNay": 0,
    "homNayPercent": 0,
    "gtHopDong": 0,
    "gtSanLuong": 0,
    "gtConLai": 0,
    "gtNghiemThu": 0,
    "congViecTrongNgay": 0,
    "vuongMac": 0
  }
}`;

        // -- 4. Xay dung user message --
        const userContent: any[] = [];
        const hasEnoughText = extractedText && extractedText.trim().length > 500;

        if (hasEnoughText) {
            const totalLen = extractedText.length;
            const textToSend = totalLen <= 40000 ? extractedText : extractedText.substring(0, 40000);
            userContent.push({
                type: "text",
                text: `NOI DUNG BAO CAO NGAY (${totalLen} ky tu):\n\n${textToSend}`
            });
            console.log(`TEXT mode: gui ${textToSend.length} ky tu`);
            
            // Bổ sung ảnh trang đầu vào Text mode để xử lý lỗi rớt dòng "Ngày tháng" của Thường Phước
            if (hasImages && pageImages.length > 0) {
                 userContent.push({
                     type: "text",
                     text: "HINH ANH TONG QUAN TRANG DAU TIEN: Kiem tra truc quan de bam sat vi tri cua CHINH XAC NGAY BAO CAO (vi van ban OCR hay bi dut doan, tron lan):"
                 });
                 const img = pageImages[0];
                 const imageUrl = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
                 userContent.push({
                     type: "image_url",
                     image_url: { url: imageUrl, detail: "high" }
                 });
                 console.log("Attached P1 Image info for Text Mode Vision");
            }

        } else if (hasImages) {
            userContent.push({
                type: "text",
                text: `Day la bao cao tien do thi cong ngay (${pageImages.length} trang anh). Trich xuat tat ca thong tin:`
            });
            for (const img of pageImages) {
                const imageUrl = img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`;
                userContent.push({
                    type: "image_url",
                    image_url: { url: imageUrl, detail: "high" }
                });
            }
            console.log(`IMAGE mode: gui ${pageImages.length} anh`);
        } else {
            return NextResponse.json({
                error: 'Khong nhan dien duoc noi dung file bao cao.'
            }, { status: 400 });
        }

        console.log(`Model: ${overrideModel}`);

        const isReasoningModel = overrideModel.startsWith('o');

        const completion = await openai.chat.completions.create({
            model: overrideModel,
            ...(isReasoningModel ? {} : { response_format: { type: "json_object" } }),
            ...(isReasoningModel ? {} : { max_tokens: 2000 }),
            messages: [
                { role: isReasoningModel ? "developer" : "system", content: systemPrompt },
                { role: "user", content: userContent }
            ]
        });

        const resultText = completion.choices[0].message.content || "{}";
        const result = JSON.parse(resultText);
        console.log("AI Response:", JSON.stringify(result, null, 2));
        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error('API error:', error);
        const msg = error instanceof Error ? error.message : 'Internal Server Error';
        if (msg.includes('API key') || msg.includes('Incorrect API key')) {
            return NextResponse.json({ error: 'API key khong hop le. Kiem tra lai trong Settings.' }, { status: 400 });
        }
        return NextResponse.json({ error: `Loi server: ${msg}` }, { status: 500 });
    }
}
