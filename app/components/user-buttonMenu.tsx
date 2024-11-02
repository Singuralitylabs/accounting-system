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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {userImage && (
        <img
          src={userImage}
          alt={userName || ""}
          className="w-8 h-8 rounded-full"
        />
      )}
      {isHovered ? (
        <button
          onClick={onSignOut}
          className="w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 text-left rounded transition-colors duration-200"
        >
          ログアウト
        </button>
      ) : (
        <span>{userName}</span>
      )}
    </div>
  );
};

export default UserButtonMenu;
