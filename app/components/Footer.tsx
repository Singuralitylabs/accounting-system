import React, { FC } from "react";
import Image from "next/image";

export const Footer: FC = () => {
  return (
    <footer className="bg-gray-100 p-4 flex justify-center w-full bottom-0">
      <a
        href="https://future-tech-association.org/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>
          <Image
            className="flex justify-center"
            src="/futuretech_logo.svg"
            alt="futuretech Logo"
            width={216}
            height={48}
          />
        </span>
      </a>
    </footer>
  );
};
