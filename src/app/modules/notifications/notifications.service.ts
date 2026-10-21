import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';

export const getMyNotificationsDB = async (
  userId: string,
  query: { unreadOnly: boolean; page: number; pageSize: number },
) => {
  const { unreadOnly, page, pageSize } = query;

  const where = {
    userId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, type: true, jobId: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where }),
    // Always counts every unread one, whatever the filter, for the bell badge.
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { items, total, unreadCount };
};


export const markNotificationReadDB = async(userId:string, notificationId:string)=>{
     
 const select  = {id:true, type:true, jobId:true, readAt: true, createdAt:true} as const;
 const existing = await prisma.notification.findFirst({
    where:{id: notificationId, userId},
    select 
}) 

  if(!existing){
    throw new AppError("NOT_FOUND", "Notification not found")
  }

  if(existing.readAt) return existing

  return prisma.notification.update({
    where:{
        id:notificationId
    },
    data:{
        readAt: new Date()
    },
    select
  })

}


export const markAllNotificationsReadDB = async(userId: string)=>{
     const result = await prisma.notification.updateMany({
       where:{userId, readAt:null},
       data:{readAt: new Date()}
     });
     
     return {updated: result.count}
}
