import { Menu } from "@base-ui/react/menu";
import { ArrowDownWideNarrow, Check, ChevronDown, LayoutGrid, List, ListFilter } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./common.js";
import { libraryTypeLabels, type LibraryFilter, type LibrarySort } from "./library-media.js";

type Choice<T extends string> = { readonly value: T; readonly label: string };

const sortFields: readonly Choice<LibrarySort["field"]>[] = [
  { value: "adoptedAt", label: "导入时间" }, { value: "name", label: "名称" },
  { value: "duration", label: "时长" },
];
const sortDirections = {
  adoptedAt: [{ value: "ascending", label: "远-近" }, { value: "descending", label: "近-远" }],
  name: [{ value: "ascending", label: "A-Z" }, { value: "descending", label: "Z-A" }],
  duration: [{ value: "ascending", label: "短-长" }, { value: "descending", label: "长-短" }],
} satisfies Record<LibrarySort["field"], readonly Choice<LibrarySort["direction"]>[]>;
const filters: readonly Choice<LibraryFilter>[] = [
  { value: "all", label: "全部" },
  { value: "image", label: libraryTypeLabels.image },
  { value: "video", label: libraryTypeLabels.video },
  { value: "audio", label: libraryTypeLabels.audio },
];

function Choices<T extends string>({ label, value, options, onChange, closeOnClick = true }: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly Choice<T>[];
  readonly onChange: (value: T) => void;
  readonly closeOnClick?: boolean;
}) {
  return <Menu.RadioGroup aria-label={label} className="library-menu-choices" value={value} onValueChange={onChange}>
    {options.map(option => <Menu.RadioItem className="dropdown-item" key={option.value} value={option.value} closeOnClick={closeOnClick}>
      {option.label}
      <Menu.RadioItemIndicator className="dropdown-item-check"><Check size={14}/></Menu.RadioItemIndicator>
    </Menu.RadioItem>)}
  </Menu.RadioGroup>;
}

function Popup({ label, children }: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return <Menu.Portal>
    <Menu.Positioner className="dropdown-positioner" side="bottom" align="end" sideOffset={5} collisionPadding={10}>
      <Menu.Popup className="dropdown-content dropdown-menu library-options-menu" aria-label={label}>
        {children}
      </Menu.Popup>
    </Menu.Positioner>
  </Menu.Portal>;
}

export function LibraryDisplayOptions({ listView, onToggleView, sort, onSort, filter, onFilter }: {
  readonly listView: boolean;
  readonly onToggleView: () => void;
  readonly sort: LibrarySort;
  readonly onSort: (sort: LibrarySort) => void;
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
}) {
  const viewLabel = listView ? "切换为网格视图" : "切换为列表视图";
  const ViewIcon = listView ? LayoutGrid : List;
  const filtered = filter !== "all";
  return <div className="library-display-options">
    <IconButton className="library-display-trigger" label={viewLabel} data-list={listView} onClick={onToggleView}>
      <ViewIcon size={17} strokeWidth={1.7}/>
    </IconButton>
    <Menu.Root modal={false}>
      <Menu.Trigger className="icon-button library-display-trigger library-display-dropdown" aria-label="排序" title="排序">
        <ArrowDownWideNarrow size={16}/><ChevronDown size={10}/>
      </Menu.Trigger>
      <Popup label="排序">
        <Choices label="排序字段" value={sort.field} options={sortFields} closeOnClick={false}
          onChange={field => onSort({ ...sort, field })}/>
        <Menu.Separator className="library-menu-separator"/>
        <Choices label="排序方向" value={sort.direction} options={sortDirections[sort.field]} closeOnClick={false}
          onChange={direction => onSort({ ...sort, direction })}/>
      </Popup>
    </Menu.Root>
    <Menu.Root modal={false}>
      <Menu.Trigger className="icon-button library-display-trigger library-display-dropdown" aria-label="筛选" title="筛选"
        data-filtered={filtered}>
        <ListFilter size={16}/><ChevronDown size={10}/>
      </Menu.Trigger>
      <Popup label="筛选"><Choices label="素材类型" value={filter} options={filters} onChange={onFilter}/></Popup>
    </Menu.Root>
  </div>;
}
