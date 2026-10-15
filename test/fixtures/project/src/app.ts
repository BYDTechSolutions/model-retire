// OpenAI models
const legacy = "gpt-4"; // undated alias
const current = "gpt-4o"; // not deprecated: must not match
const turbo = 'gpt-4-turbo';
const nano = `gpt-4.1-nano-2025-04-14`;
const tuned = "ft:gpt-4-0613:my-org::abc123";
const notAMatch = ["gpt-4.1", "gpt-4-0613x", "xgpt-4", "GPT-4", "gpt-4_beta"];
export const models = { legacy, current, turbo, nano, tuned, notAMatch };
