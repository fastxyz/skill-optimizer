import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(pluginDir, "..", "..", "skills");

function registerSkillsDir(config) {
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];

  if (!config.skills.paths.includes(skillsDir)) {
    config.skills.paths.push(skillsDir);
  }
}

export const SkillOptimizerPlugin = async () => ({
  config: async (config) => {
    registerSkillsDir(config);
  },
});

export default {
  id: "skill-optimizer",
  server: SkillOptimizerPlugin,
};
