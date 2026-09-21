import { Hud } from "@/components/hud";

export default function Page() {
  return <Hud hasKey={Boolean(process.env.AI_GATEWAY_API_KEY?.trim())} />;
}
