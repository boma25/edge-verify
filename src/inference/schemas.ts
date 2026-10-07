/**
 * JSON Schemas (for constrained decoding) and prompts.
 *
 * Why two passes?  A small on-device model does not hand you a calibrated
 * confidence score. What you CAN measure is self-consistency: read the same
 * image twice with a differently-worded prompt and a different field order,
 * then compare. Disagreement is a strong "do not trust this" signal.
 *
 * Constrained decoding guarantees the output parses against the schema, which
 * removes a whole class of "the model returned prose" failures.
 */

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

type Props = Record<string, unknown>;

/** Re-orders properties; with constrained decoding this changes generation order. */
function reversed(props: Props): Props {
  return Object.fromEntries(Object.entries(props).reverse());
}

function objectSchema(props: Props) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: props,
    required: Object.keys(props),
  };
}

/* ------------------------------ Proof of address ------------------------------ */

const addressProps: Props = {
  documentType: {
    type: 'string',
    enum: [
      'utility_bill',
      'bank_statement',
      'tenancy_agreement',
      'government_letter',
      'other',
      'not_a_document',
    ],
  },
  fullName: nullableString,
  addressLine: nullableString,
  city: nullableString,
  state: nullableString,
  issueDate: nullableString,
  issuer: nullableString,
  legibility: { type: 'string', enum: ['clear', 'partial', 'poor'] },
};

export const ADDRESS_SCHEMA_A = objectSchema(addressProps);
export const ADDRESS_SCHEMA_B = objectSchema(reversed(addressProps));

export const ADDRESS_SYSTEM_PROMPT = [
  'You are a careful document-reading assistant running on a phone.',
  'You look at ONE image and answer with JSON that matches the schema.',
  'Rules:',
  '- Report only what is visibly printed in the image. Never guess or infer; use null for anything not clearly visible.',
  '- Dates must be written YYYY-MM-DD. If a date is cut off or ambiguous, use null.',
  '- documentType is "not_a_document" if the image does not show a printed or on-screen document.',
  '- fullName is the account holder the document is addressed to, not the sender or company.',
  '- legibility is "clear" if every field is easy to read, "partial" if some text is blurry, cut off or hard to read, "poor" if most text is unreadable.',
].join('\n');

export const ADDRESS_PROMPT_A =
  'Read this document and extract the fields described by the schema.';

export const ADDRESS_PROMPT_B =
  'Look at this image again from scratch. Work from the bottom of the page upwards: first the date, then the address block, then the account holder, then the issuer and the document type. Judge legibility last. Answer with the schema.';

/* ------------------------------ Completed job photo ------------------------------ */

const jobProps: Props = {
  category: {
    type: 'string',
    enum: ['plumbing', 'electrical', 'carpentry', 'painting', 'tiling', 'hvac', 'cleaning', 'other', 'unclear'],
  },
  workAppearsComplete: { type: 'string', enum: ['yes', 'partial', 'no', 'cannot_tell'] },
  isRealSitePhoto: { type: 'boolean' },
  photoQuality: { type: 'string', enum: ['clear', 'blurry', 'dark'] },
  description: { type: 'string' },
};

export const JOB_SCHEMA_A = objectSchema(jobProps);
export const JOB_SCHEMA_B = objectSchema(reversed(jobProps));

export type JobPhotoRole = 'before' | 'after';

export const JOB_SYSTEM_PROMPT = [
  'You are a careful photo-checking assistant running on a phone.',
  'You look at ONE labeled site photo from a repair job. The user message says whether it is BEFORE (fault) or AFTER (fix). Answer with JSON that matches the schema.',
  'Rules:',
  '- Describe only what is visible. If you cannot tell, say so with "unclear" or "cannot_tell".',
  '- Respect the BEFORE/AFTER label in the user message when judging workAppearsComplete.',
  '- For BEFORE: expect broken, missing, open, or unfinished work — use "no" or "partial" unless it clearly already looks finished.',
  '- For AFTER: expect the repair result — use "yes" only when the work looks finished; "no"/"partial" if it still looks incomplete.',
  '- isRealSitePhoto must be true for ordinary phone photos of walls, sockets, boxes, pipes, or other on-site work — even if indoor, plain, or close-up.',
  '- isRealSitePhoto is false ONLY when it is clearly a screenshot, a stock image, a drawing/CGI, or a photo of another phone/monitor screen (visible bezel, UI chrome, or moiré). When unsure, use true.',
  '- photoQuality is "blurry" if the main subject is out of focus and "dark" if it is too dark to judge.',
  '- description is ONE short sentence.',
].join('\n');

export const JOB_BEFORE_PROMPT_A =
  'BEFORE photo (fault / incomplete state). Phone photo of the job before the repair — treat as a real site photo unless it is clearly a screenshot or stock image. Say the trade, how broken or unfinished it looks (workAppearsComplete should usually be "no" or "partial"), and fill in the schema.';

export const JOB_BEFORE_PROMPT_B =
  'BEFORE photo again from scratch. Prefer isRealSitePhoto=true for a normal on-site phone photo. Then say what trade and that this is the broken/incomplete state unless it clearly already looks finished. Answer with the schema.';

export const JOB_AFTER_PROMPT_A =
  'AFTER photo (repair result). Phone photo of the job after the repair — treat as a real site photo unless it is clearly a screenshot or stock image. Say the trade, whether the work looks finished (workAppearsComplete "yes" only if done), and fill in the schema.';

export const JOB_AFTER_PROMPT_B =
  'AFTER photo again from scratch. Prefer isRealSitePhoto=true for a normal on-site phone photo. Then say what trade and whether the repair looks finished. Answer with the schema.';

/** @deprecated Use role-specific prompts via jobPassSpecs. */
export const JOB_PROMPT_A = JOB_AFTER_PROMPT_A;
/** @deprecated Use role-specific prompts via jobPassSpecs. */
export const JOB_PROMPT_B = JOB_AFTER_PROMPT_B;

export function jobPassSpecs(role: JobPhotoRole): { prompt: string; schema: object }[] {
  if (role === 'before') {
    return [
      { prompt: JOB_BEFORE_PROMPT_A, schema: JOB_SCHEMA_A },
      { prompt: JOB_BEFORE_PROMPT_B, schema: JOB_SCHEMA_B },
    ];
  }
  return [
    { prompt: JOB_AFTER_PROMPT_A, schema: JOB_SCHEMA_A },
    { prompt: JOB_AFTER_PROMPT_B, schema: JOB_SCHEMA_B },
  ];
}
