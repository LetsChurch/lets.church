type CarouselPaginationProps = {
  isActive?: boolean;
  onClick?: () => void;
};

export function CarouselPagination({
  isActive = false,
  onClick,
}: CarouselPaginationProps) {
  return (
    <button type="button" className="cursor-pointer py-2" onClick={onClick}>
      <div className="h-0.5 w-8 overflow-hidden rounded-sm bg-gray-800">
        {isActive && (
          <div className="h-full bg-brand shadow-brand/50 shadow-lg" />
        )}
      </div>
    </button>
  );
}
