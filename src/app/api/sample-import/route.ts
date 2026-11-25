import { sampleWorkbook } from "@/lib/core/importer";

export async function GET() {
  const buf = await sampleWorkbook();
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="wafda-guests-sample.xlsx"`,
    },
  });
}
