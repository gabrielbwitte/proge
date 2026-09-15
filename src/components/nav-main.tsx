import type { ModuleId } from "@/features/projection/types"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export interface NavItem {
  title: string
  id: ModuleId
  icon?: React.ReactNode
}

export function NavMain({
  items,
  activeModule,
  onModuleSelect,
}: {
  items: NavItem[]
  activeModule: ModuleId
  onModuleSelect: (module: ModuleId) => void
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={item.id === activeModule}
                onClick={() => onModuleSelect(item.id)}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
