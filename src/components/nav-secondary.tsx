"use client"

import * as React from "react"

import type { ModuleId } from "@/features/projection/types"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { NavItem } from "./nav-main"

export function NavSecondary({
  items,
  activeModule,
  onModuleSelect,
  ...props
}: {
  items: NavItem[]
  activeModule: ModuleId
  onModuleSelect: (module: ModuleId) => void
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
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
