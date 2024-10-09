"use client";

import { Avatar } from "@mantine/core";
import React, { useState } from "react";
import { SignOut } from "./auth-components";

const UserButtonMenu = ({
  userName,
  userImage,
}: {
  userName: string | null | undefined;
  userImage: string | null | undefined;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => setIsOpen(!isOpen);

  return (
    <div className="relative inline-block text-left">
      <div
        className="flex gap-2 items-center hover:cursor-pointer"
        onClick={toggleDropdown}
      >
        <p>{userName}</p>
        <Avatar src={userImage} alt={userName!} />
      </div>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 px-4 py-2 text-gray-700 hover:bg-gray-100">
          <SignOut />
        </div>
      )}
    </div>
  );
};

export default UserButtonMenu;
