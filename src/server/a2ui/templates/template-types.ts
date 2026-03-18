export type TemplateFallbackPolicy =
  | { mode: "partial_allowed" }
  | { mode: "fallback_template"; fallbackTemplateId: string }
  | { mode: "text_fallback" };

export interface A2UITemplateDef {
  id: string;
  name: string;
  description: string;
  cardType: string;
  requiredBindings: string[];
  optionalBindings: string[];
  fallbackPolicy: TemplateFallbackPolicy;
}
