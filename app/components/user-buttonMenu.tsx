import { useState } from "react";

type UserButtonMenuProps = {
  userName?: string | null;
  userImage?: string | null;
  onSignOut: () => Promise<void>;
};

const UserButtonMenu = ({
  userName,
  userImage,
  onSignOut,
}: UserButtonMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="flex relative items-center gap-2 cursor-pointer"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {userImage && (
        <img
          src={userImage}
          alt={userName || ""}
          className="w-8 h-8 rounded-full"
        />
      )}
      <span>{userName}</span>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
          <button
            onClick={onSignOut}
            className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
};

export default UserButtonMenu;
