import type { ScenarioContext } from "../types";

export const DEFAULT_SCENARIO_CONTEXT: ScenarioContext = {
  sector: "", topic: "", opponent_role: "", opponent_goal: "",
  // «По описанию»: панель необязательна, и нетронутая она ничего не решает.
  difficulty: null, style: null,
};
