/** One project-owned file attached to a review comment. */
export type FeedbackAttachment = {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly name: string;
};

/** One project-owned review note. Time is seconds in the explicitly named context. */
export type FeedbackComment = {
  readonly id: string;
  readonly context: string;
  readonly at: number;
  readonly text: string;
  readonly resolved: boolean;
  readonly attachments: readonly FeedbackAttachment[];
};

export type FeedbackDocument = {
  readonly format: "hypit.feedback@1";
  readonly comments: readonly FeedbackComment[];
};

export type FeedbackView = {
  readonly format: "hypit.feedback-view@1";
  readonly file: "feedback/project.feedback.json";
  readonly context: string;
  readonly comments: readonly FeedbackComment[];
};

export type FeedbackAttachmentUpload = {
  readonly attachment: FeedbackAttachment;
  readonly stagedFile: string;
};

export type FeedbackMutation =
  | { readonly type: "add"; readonly comment: FeedbackComment }
  | { readonly type: "replace"; readonly before: FeedbackComment; readonly comment: FeedbackComment }
  | { readonly type: "delete"; readonly before: FeedbackComment };
