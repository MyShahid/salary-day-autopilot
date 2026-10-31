import { badJson, readJson, toResponse } from "@/lib/http";
import { updateProfile } from "@/lib/settings-service";

export async function PATCH(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await updateProfile(body)) : badJson();
}
