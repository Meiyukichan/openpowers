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
}

/**
 * Claude-specific provider presets.
 * Each preset contains the default name, baseUrl, icon, and iconColor.
 * When a preset is selected in the add dialog, the form's name and baseUrl
 * fields are pre-filled with these values.
 */
export const claudeProviderPresets: ProviderPreset[] = [
  {
    name: 'Claude Official',
    websiteUrl: 'https://www.anthropic.com/claude-code',
    baseUrl: 'https://api.anthropic.com',
    icon: 'sparkles',
    iconColor: '#D4915D',
  },
  {
    name: 'Shengsuanyun',
    websiteUrl: 'https://www.shengsuanyun.com',
    baseUrl: 'https://router.shengsuanyun.com/api',
    icon: 'zap',
    iconColor: '#f59e0b',
  },
  {
    name: 'PatewayAI',
    websiteUrl: 'https://pateway.ai',
    baseUrl: 'https://api.pateway.ai',
    icon: 'globe',
    iconColor: '#3b82f6',
  },
  {
    name: 'DeepSeek',
    websiteUrl: 'https://platform.deepseek.com',
    baseUrl: 'https://api.deepseek.com/anthropic',
    icon: 'cpu',
    iconColor: '#1E88E5',
  },
  {
    name: 'Zhipu GLM',
    websiteUrl: 'https://open.bigmodel.cn',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    icon: 'bot',
    iconColor: '#0F62FE',
  },
  {
    name: 'Zhipu GLM en',
    websiteUrl: 'https://z.ai',
    baseUrl: 'https://api.z.ai/api/anthropic',
    icon: 'bot',
    iconColor: '#0F62FE',
  },
  {
    name: 'Baidu Qianfan Coding Plan',
    websiteUrl: 'https://cloud.baidu.com/product/qianfan_modelbuilder',
    baseUrl: 'https://qianfan.baidubce.com/anthropic/coding',
    icon: 'cloud',
    iconColor: '#2932E1',
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
  {
    name: 'Kimi',
    websiteUrl: 'https://platform.moonshot.cn/console',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    icon: 'star',
    iconColor: '#6366F1',
  },
  {
    name: 'Kimi For Coding',
    websiteUrl: 'https://www.kimi.com/code/docs/',
    baseUrl: 'https://api.kimi.com/coding/',
    icon: 'star',
    iconColor: '#6366F1',
  },
  {
    name: 'StepFun',
    websiteUrl: 'https://platform.stepfun.com/step-plan',
    baseUrl: 'https://api.stepfun.com/step_plan',
    icon: 'zap',
    iconColor: '#16D6D2',
  },
  {
    name: 'StepFun en',
    websiteUrl: 'https://platform.stepfun.ai/step-plan',
    baseUrl: 'https://api.stepfun.ai/step_plan',
    icon: 'zap',
    iconColor: '#16D6D2',
  },
  {
    name: 'ModelScope',
    websiteUrl: 'https://modelscope.cn',
    baseUrl: 'https://api-inference.modelscope.cn',
    icon: 'globe',
    iconColor: '#624AFF',
  },
  {
    name: 'Longcat',
    websiteUrl: 'https://longcat.chat/platform',
    baseUrl: 'https://api.longcat.chat/anthropic',
    icon: 'bot',
    iconColor: '#29E154',
  },
  {
    name: 'MiniMax',
    websiteUrl: 'https://platform.minimaxi.com',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    icon: 'sparkles',
    iconColor: '#FF6B6B',
  },
  {
    name: 'MiniMax en',
    websiteUrl: 'https://platform.minimax.io',
    baseUrl: 'https://api.minimax.io/anthropic',
    icon: 'sparkles',
    iconColor: '#FF6B6B',
  },
  {
    name: 'BaiLing',
    websiteUrl: 'https://alipaytbox.yuque.com/sxs0ba/ling/get_started',
    baseUrl: 'https://api.tbox.cn/api/anthropic',
    icon: 'wrench',
    iconColor: '#6366f1',
  },
  {
    name: 'AiHubMix',
    websiteUrl: 'https://aihubmix.com',
    baseUrl: 'https://aihubmix.com',
    icon: 'globe',
    iconColor: '#006FFB',
  },
  {
    name: 'SiliconFlow',
    websiteUrl: 'https://siliconflow.cn',
    baseUrl: 'https://api.siliconflow.cn',
    icon: 'zap',
    iconColor: '#6E29F6',
  },
  {
    name: 'SiliconFlow en',
    websiteUrl: 'https://siliconflow.com',
    baseUrl: 'https://api.siliconflow.com',
    icon: 'zap',
    iconColor: '#000000',
  },
  {
    name: 'DMXAPI',
    websiteUrl: 'https://www.dmxapi.cn',
    baseUrl: 'https://www.dmxapi.cn',
    icon: 'globe',
    iconColor: '#f59e0b',
  },
  {
    name: 'PackyCode',
    websiteUrl: 'https://www.packyapi.com',
    baseUrl: 'https://www.packyapi.com',
    icon: 'globe',
    iconColor: '#3b82f6',
  },
  {
    name: 'ClaudeAPI',
    websiteUrl: 'https://claudeapi.com',
    baseUrl: 'https://gw.claudeapi.com',
    icon: 'sparkles',
    iconColor: '#d97706',
  },
  {
    name: 'ClaudeCN',
    websiteUrl: 'https://claudecn.top',
    baseUrl: 'https://claudecn.top',
    icon: 'sparkles',
    iconColor: '#f59e0b',
  },
  {
    name: 'RunAPI',
    websiteUrl: 'https://runapi.co',
    baseUrl: 'https://runapi.co',
    icon: 'bot',
    iconColor: '#3b82f6',
  },
  {
    name: 'RelaxyCode',
    websiteUrl: 'https://www.relaxycode.com',
    baseUrl: 'https://www.relaxycode.com',
    icon: 'bot',
    iconColor: '#6366f1',
  },
  {
    name: 'Cubence',
    websiteUrl: 'https://cubence.com',
    baseUrl: 'https://api.cubence.com',
    icon: 'globe',
    iconColor: '#000000',
  },
  {
    name: 'AIGoCode',
    websiteUrl: 'https://aigocode.com',
    baseUrl: 'https://api.aigocode.com',
    icon: 'cpu',
    iconColor: '#5B7FFF',
  },
  {
    name: 'RightCode',
    websiteUrl: 'https://www.right.codes',
    baseUrl: 'https://www.right.codes/claude',
    icon: 'cpu',
    iconColor: '#E96B2C',
  },
  {
    name: 'AICodeMirror',
    websiteUrl: 'https://www.aicodemirror.com',
    baseUrl: 'https://api.aicodemirror.com/api/claudecode',
    icon: 'globe',
    iconColor: '#000000',
  },
  {
    name: 'AICoding',
    websiteUrl: 'https://aicoding.sh',
    baseUrl: 'https://api.aicoding.sh',
    icon: 'cpu',
    iconColor: '#000000',
  },
  {
    name: 'CrazyRouter',
    websiteUrl: 'https://www.crazyrouter.com',
    baseUrl: 'https://cn.crazyrouter.com',
    icon: 'globe',
    iconColor: '#000000',
  },
  {
    name: 'SSSAiCode',
    websiteUrl: 'https://www.sssaicode.com',
    baseUrl: 'https://node-hk.sssaicode.com/api',
    icon: 'bot',
    iconColor: '#000000',
  },
  {
    name: 'Compshare',
    websiteUrl: 'https://www.compshare.cn',
    baseUrl: 'https://api.modelverse.cn',
    icon: 'cloud',
    iconColor: '#000000',
  },
  {
    name: 'Compshare Coding Plan',
    websiteUrl: 'https://www.compshare.cn',
    baseUrl: 'https://cp.compshare.cn',
    icon: 'cloud',
    iconColor: '#000000',
  },
  {
    name: 'Micu',
    websiteUrl: 'https://www.micuapi.ai',
    baseUrl: 'https://www.micuapi.ai',
    icon: 'bot',
    iconColor: '#000000',
  },
  {
    name: 'CTok.ai',
    websiteUrl: 'https://ctok.ai',
    baseUrl: 'https://api.ctok.ai',
    icon: 'globe',
    iconColor: '#000000',
  },
  {
    name: 'E-FlowCode',
    websiteUrl: 'https://e-flowcode.cc',
    baseUrl: 'https://e-flowcode.cc',
    icon: 'zap',
    iconColor: '#000000',
  },
  {
    name: 'OpenRouter',
    websiteUrl: 'https://openrouter.ai',
    baseUrl: 'https://openrouter.ai/api',
    icon: 'globe',
    iconColor: '#6566F1',
  },
  {
    name: 'TheRouter',
    websiteUrl: 'https://therouter.ai',
    baseUrl: 'https://api.therouter.ai',
    icon: 'globe',
    iconColor: '#3b82f6',
  },
  {
    name: 'Novita AI',
    websiteUrl: 'https://novita.ai',
    baseUrl: 'https://api.novita.ai/anthropic',
    icon: 'globe',
    iconColor: '#000000',
  },
  {
    name: 'LemonData',
    websiteUrl: 'https://lemondata.cc',
    baseUrl: 'https://api.lemondata.cc',
    icon: 'globe',
    iconColor: '#f59e0b',
  },
  {
    name: 'PIPELLM',
    websiteUrl: 'https://code.pipellm.ai',
    baseUrl: 'https://cc-api.pipellm.ai',
    icon: 'bot',
    iconColor: '#3b82f6',
  },
  {
    name: 'Xiaomi MiMo',
    websiteUrl: 'https://platform.xiaomimimo.com',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    icon: 'sparkles',
    iconColor: '#000000',
  },
  {
    name: 'Xiaomi MiMo Token Plan (China)',
    websiteUrl: 'https://platform.xiaomimimo.com/#/token-plan',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    icon: 'sparkles',
    iconColor: '#000000',
  },
];
