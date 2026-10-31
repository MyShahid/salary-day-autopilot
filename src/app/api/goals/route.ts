import { badJson, readJson, toResponse } from "@/lib/http";
import { createGoal } from "@/lib/settings-service";

export async function POST(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await createGoal(body), 201) : badJson();
}
