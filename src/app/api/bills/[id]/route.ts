import { badJson, readJson, toResponse } from "@/lib/http";
import { deleteBill, updateBill } from "@/lib/settings-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await readJson(req);
  return body ? toResponse(await updateBill(id, body)) : badJson();
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  return toResponse(await deleteBill(id));
}
