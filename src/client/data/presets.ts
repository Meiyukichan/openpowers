/**
 * Hardcoded Claude provider preset data.
 * Referenced from cc-switch's claudeProviderPresets.ts patterns.
 * Only Claude-specific presets are included — no universal/generic presets.
 * @author Meiyuki <meiyukichan@163.com>
 * @copyright 2026 Meiyuki
 */

/** Simplified preset data used by the preset selector in AddProviderDialog. */
export interface ProviderPreset {
  /** Display name of the preset provider */
  name: string;
  /** Official website URL (optional) */
  websiteUrl?: string;
  /** Default API base URL */
  baseUrl: string;
  /** Lucide icon name */
  icon: string;
  /** Icon color (hex) */
  iconColor: string;
  /** Default model name for general use (optional) */
  defaultModel?: string;
  /** Default Sonnet-tier model name (optional) */
  sonnetModel?: string;
  /** Default Opus-tier model name (optional) */
  opusModel?: string;
  /** Default Haiku-tier model name (optional) */
  haikuModel?: string;
}

/**
 * Claude-specific provider presets.
 * Each preset contains the default name, baseUrl, icon, and iconColor.
 * When a preset is selected in the add dialog, the form's name and baseUrl
 * fields are pre-filled with these values.
 */
export const claudeProviderPresets: ProviderPreset[] = [
  {
    name: '自定义配置',
    baseUrl: '',
    icon: 'wrench',
    iconColor: '#6b7280',
  },
  {
    name: 'Claude Official',
    websiteUrl: 'https://www.anthropic.com/claude-code',
    baseUrl: 'https://api.anthropic.com',
    icon: 'sparkles',
    iconColor: '#D4915D',
  },
  {
    name: 'DeepSeek',
    websiteUrl: 'https://platform.deepseek.com',
    baseUrl: 'https://api.deepseek.com/anthropic',
    icon: 'cpu',
    iconColor: '#1E88E5',
    defaultModel: 'deepseek-v4-pro',
    sonnetModel: 'deepseek-v4-pro',
    opusModel: 'deepseek-v4-pro',
    haikuModel: 'deepseek-v4-flash',
  },
  {
    name: 'Xiaomi MiMo',
    websiteUrl: 'https://platform.xiaomimimo.com',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    icon: 'sparkles',
    iconColor: '#000000',
    defaultModel: 'mimo-v2.5-pro',
    sonnetModel: 'mimo-v2.5-pro',
    opusModel: 'mimo-v2.5-pro',
    haikuModel: 'mimo-v2.5-pro',
  },
  {
    name: 'Xiaomi MiMo Token Plan (China)',
    websiteUrl: 'https://platform.xiaomimimo.com/#/token-plan',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    icon: 'sparkles',
    iconColor: '#000000',
    defaultModel: 'mimo-v2.5-pro',
    sonnetModel: 'mimo-v2.5-pro',
    opusModel: 'mimo-v2.5-pro',
    haikuModel: 'mimo-v2.5-pro',
  },
  {
    name: 'Zhipu GLM',
    websiteUrl: 'https://open.bigmodel.cn',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    icon: 'bot',
    iconColor: '#0F62FE',
    defaultModel: 'glm-5.1',
    sonnetModel: 'glm-5.1',
    opusModel: 'glm-5.1',
    haikuModel: 'glm-5.1',
  },
  {
    name: 'Zhipu GLM en',
    websiteUrl: 'https://z.ai',
    baseUrl: 'https://api.z.ai/api/anthropic',
    icon: 'bot',
    iconColor: '#0F62FE',
    defaultModel: 'glm-5.1',
    sonnetModel: 'glm-5.1',
    opusModel: 'glm-5.1',
    haikuModel: 'glm-5.1',
  },
  {
    name: 'MiniMax',
    websiteUrl: 'https://platform.minimaxi.com',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    icon: 'sparkles',
    iconColor: '#FF6B6B',
    defaultModel: 'MiniMax-M2.7',
    sonnetModel: 'MiniMax-M2.7',
    opusModel: 'MiniMax-M2.7',
    haikuModel: 'MiniMax-M2.7',
  },
  {
    name: 'MiniMax en',
    websiteUrl: 'https://platform.minimax.io',
    baseUrl: 'https://api.minimax.io/anthropic',
    icon: 'sparkles',
    iconColor: '#FF6B6B',
    defaultModel: 'MiniMax-M2.7',
    sonnetModel: 'MiniMax-M2.7',
    opusModel: 'MiniMax-M2.7',
    haikuModel: 'MiniMax-M2.7',
  },
  {
    name: 'Kimi',
    websiteUrl: 'https://platform.moonshot.cn/console',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    icon: 'star',
    iconColor: '#6366F1',
    defaultModel: 'kimi-k2.6',
    sonnetModel: 'kimi-k2.6',
    opusModel: 'kimi-k2.6',
    haikuModel: 'kimi-k2.6',
  },
  {
    name: 'Kimi For Coding',
    websiteUrl: 'https://www.kimi.com/code/docs/',
    baseUrl: 'https://api.kimi.com/coding/',
    icon: 'star',
    iconColor: '#6366F1',
  },
  {
    name: 'Bailian',
    websiteUrl: 'https://bailian.console.aliyun.com',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    icon: 'cloud',
    iconColor: '#624AFF',
  },
  {
    name: 'Bailian For Coding',
    websiteUrl: 'https://bailian.console.aliyun.com',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    icon: 'cloud',
    iconColor: '#624AFF',
  },
];
