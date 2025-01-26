import React, { useState } from "react";
import {
  Table,
  Popover,
  Button,
  Stack,
  Checkbox,
  ScrollArea,
} from "@mantine/core";
import { IoMdArrowDropdown } from "react-icons/io";
import { MatterInfoWithUserNameType } from "../types/types";

type Props = {
  label: string;
  filterKey: keyof MatterInfoWithUserNameType;
  uniqueValues: string[];
  activeFilters: Set<string>;
  onFilterChange: (
    key: keyof MatterInfoWithUserNameType,
    values: Set<string>
  ) => void;
};

const FilterableTableHeader = ({
  label,
  filterKey,
  uniqueValues,
  activeFilters,
  onFilterChange,
}: Props) => {
  const [opened, setOpened] = useState(false);

  const handleFilterChange = (value: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(value)) {
      newFilters.delete(value);
    } else {
      newFilters.add(value);
    }
    onFilterChange(filterKey, newFilters);
  };

  const handleClearFilters = () => {
    onFilterChange(filterKey, new Set());
    setOpened(false);
  };

  return (
    <Table.Th className="whitespace-nowrap px-4 text-center">
      <div className="flex items-center justify-center gap-1">
        {label}
        <Popover
          opened={opened}
          onChange={setOpened}
          position="bottom-start"
          shadow="md"
        >
          <Popover.Target>
            <Button
              variant="subtle"
              size="xs"
              p={0}
              onClick={() => setOpened(true)}
              className={activeFilters.size > 0 ? "text-blue-500" : ""}
            >
              <IoMdArrowDropdown
                size={`${activeFilters.size > 0 ? "1.5rem" : "1.2rem"}`}
                className={`${activeFilters.size > 0 && "text-red-500"} ${
                  opened && "rotate-180"
                }`}
              />
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack>
              <ScrollArea h={200}>
                {uniqueValues.map((value) => (
                  <Checkbox
                    key={value}
                    label={value}
                    checked={activeFilters.has(value)}
                    onChange={() => handleFilterChange(value)}
                    className="mb-2"
                  />
                ))}
              </ScrollArea>
              <Button
                size="xs"
                variant="light"
                onClick={handleClearFilters}
                disabled={activeFilters.size === 0}
              >
                フィルターをクリア
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </div>
    </Table.Th>
  );
};

export default FilterableTableHeader;
