import QRCode from "qrcode";

/** يولّد رمز QR بصيغة SVG في الخادم. المحتوى رابط التذكرة فقط (رمز عشوائي بلا بيانات شخصية). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#28182C", light: "#FFFFFF" } });
}
