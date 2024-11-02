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
  return (
    <div className="flex items-center gap-2">
      {userImage && (
        <img
          src={userImage}
          alt={userName || ""}
          className="w-8 h-8 rounded-full"
        />
      )}
      <span>{userName}</span>
      <button
        onClick={onSignOut}
        className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
      >
        ログアウト
      </button>
    </div>
  );
};

export default UserButtonMenu;
