import type { NleCommand, NleProject, NleTransaction } from "@hypit/nle";
import type { NleTimelineViewTransaction } from "@hypit/nle-view";

export type NleTransactionChanges = {
  readonly project: boolean;
  readonly tracks: readonly string[];
  readonly items: readonly string[];
};

function commandAffectsProgramme(command: NleCommand): boolean {
  switch (command.kind) {
    case "project.update":
      return command.canvas !== undefined;
    case "component-value.add":
    case "component-value.remove":
    case "picture-layout.add":
    case "picture-layout.remove":
    case "item.update":
      return false;
    case "component-value.replace":
    case "picture-layout.replace":
      return true;
    case "track.update":
      return command.muted !== undefined;
    default:
      return true;
  }
}

/** NLE application impact; it is intentionally not part of the NLE domain model or AVIR. */
export function nleTransactionAffectsProgramme(transaction: NleTransaction): boolean {
  return transaction.commands.some(commandAffectsProgramme);
}

/** Timeline View facts never change audiovisual output or the current preview sampling policy. */
export function nleViewTransactionAffectsProgramme(_transaction: NleTimelineViewTransaction): boolean {
  return false;
}

function itemTrack(project: NleProject, id: string): string | undefined {
  return project.tracks.find((track) => track.items.some((item) => item.id === id))?.id;
}

/** Exact author-object identities touched by one accepted Project transaction. */
export function nleTransactionChanges(
  project: NleProject,
  transaction: NleTransaction,
): NleTransactionChanges {
  const tracks = new Set<string>();
  const items = new Set<string>();
  const addItems = (ids: readonly string[]) => {
    for (const id of ids) {
      items.add(id);
      const track = itemTrack(project, id);
      if (track !== undefined) tracks.add(track);
    }
  };
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "component-value.replace":
        addItems(project.tracks.flatMap((track) => track.items.flatMap((item) =>
          item.kind === "present" && item.source === "component"
            && item.sharedValues?.some((reference) => reference.ref === command.value.id) ? [item.id] : [])));
        break;
      case "picture-layout.replace":
        addItems(project.tracks.flatMap((track) => track.items.flatMap((item) =>
          item.kind === "present" && item.picture !== undefined && "ref" in item.picture.layout
            && item.picture.layout.ref === command.value.id ? [item.id] : [])));
        break;
      case "track.add":
        tracks.add(command.track.id);
        command.track.items.forEach((item) => items.add(item.id));
        break;
      case "track.replace": {
        tracks.add(command.track.id);
        const previous = project.tracks.find((track) => track.id === command.track.id);
        previous?.items.forEach((item) => items.add(item.id));
        command.track.items.forEach((item) => items.add(item.id));
        break;
      }
      case "track.move":
      case "track.update":
      case "track.remove":
        tracks.add(command.id);
        break;
      case "item.add":
        tracks.add(command.track);
        items.add(command.item.id);
        break;
      case "item.move":
        addItems(command.ids);
        if (command.track !== undefined) tracks.add(command.track);
        break;
      case "item.roll":
        addItems([command.left, command.right]);
        break;
      case "item.ripple-trim":
        addItems([command.id, ...command.scope]);
        break;
      case "item.split":
        addItems([command.id]);
        items.add(command.rightId);
        break;
      case "item.detach-audio":
        addItems([command.id]);
        tracks.add(command.track);
        items.add(command.audioItemId);
        break;
      case "item.remove":
        addItems(command.ids);
        break;
      case "item.replace":
        addItems([command.item.id]);
        break;
      case "item.update":
      case "item.trim":
      case "item.slip":
      case "item.retime":
        addItems([command.id]);
        break;
      case "operator-application.add":
      case "operator-application.move":
      case "operator-application.replace":
      case "operator-application.retime":
      case "operator-application.remove":
        addItems([command.item]);
        break;
      case "transition.add":
      case "transition.replace":
        addItems([command.transition.outgoing, command.transition.incoming]);
        break;
      case "transition.remove": {
        const relation = project.transitions.find((value) => value.id === command.id);
        if (relation !== undefined) addItems([relation.outgoing, relation.incoming]);
        break;
      }
      case "matte.add":
      case "matte.replace":
        addItems([command.matte.content, command.matte.matte]);
        break;
      case "matte.remove": {
        const relation = project.mattes.find((value) => value.id === command.id);
        if (relation !== undefined) addItems([relation.content, relation.matte]);
        break;
      }
      default:
        break;
    }
  }
  return { project: true, tracks: [...tracks], items: [...items] };
}

function mediaItemIds(project: NleProject, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  return project.tracks.flatMap((track) => track.items.flatMap((item) =>
    wanted.has(item.id) && item.kind === "present" && item.source === "media" ? [item.id] : []));
}

function trackMediaItemIds(project: NleProject, trackId: string): string[] {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  return track?.items.flatMap((item) =>
    item.kind === "present" && item.source === "media" ? [item.id] : []) ?? [];
}

/**
 * Media preview dependencies affected by one Project transaction.
 * Placement, names, canvas/layout and relation edits deliberately do not invalidate decoded source previews.
 */
export function nleTransactionItemPreviewInvalidations(
  project: NleProject,
  transaction: NleTransaction,
): readonly string[] {
  const items = new Set<string>();
  const add = (ids: readonly string[]) => ids.forEach((id) => items.add(id));
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "track.add":
        add(command.track.items.flatMap((item) =>
          item.kind === "present" && item.source === "media" ? [item.id] : []));
        break;
      case "track.replace":
        add(trackMediaItemIds(project, command.track.id));
        add(command.track.items.flatMap((item) =>
          item.kind === "present" && item.source === "media" ? [item.id] : []));
        break;
      case "track.remove":
        add(trackMediaItemIds(project, command.id));
        break;
      case "item.add":
        if (command.item.kind === "present" && command.item.source === "media") items.add(command.item.id);
        break;
      case "item.replace":
        add(mediaItemIds(project, [command.item.id]));
        if (command.item.kind === "present" && command.item.source === "media") items.add(command.item.id);
        break;
      case "item.trim":
      case "item.slip":
      case "item.retime":
        add(mediaItemIds(project, [command.id]));
        break;
      case "item.roll":
        add(mediaItemIds(project, [command.left, command.right]));
        break;
      case "item.ripple-trim":
        add(mediaItemIds(project, [command.id]));
        break;
      case "item.split":
        if (mediaItemIds(project, [command.id]).length > 0) add([command.id, command.rightId]);
        break;
      case "item.detach-audio":
        if (mediaItemIds(project, [command.id]).length > 0) add([command.id, command.audioItemId]);
        break;
      case "item.remove":
        add(mediaItemIds(project, command.ids));
        break;
      default:
        break;
    }
  }
  return [...items];
}

