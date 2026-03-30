'use server'

import { db } from '@/lib/db'
import { quietlySendEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'

export async function approveAccount(userId: string) {
  const user = await db.user.update({
    where: { id: userId },
    data: { role: 'MEMBER' }
  });

  const subject = "Welcome to the Downtown Coquitlam Gavel Club Portal";
  const html = `
    <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
      <h2 style="color: #002B49;">Account Approved</h2>
      <p>Hi ${user.firstName},</p>
      <p>Your portal account has been verified and fully approved by the club administrative team.</p>
      <p>You can now log in at any time to view upcoming agendas and your assigned operations.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
    </div>
  `;
  
  await quietlySendEmail(user.email, subject, html);
  revalidatePath('/admin/accounts');
}

export async function rejectAccount(userId: string) {
  const user = await db.user.delete({
    where: { id: userId }
  });

  const subject = "DTCGC Account Declined";
  const html = `
    <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
      <h2 style="color: #7B132C;">Access Revoked</h2>
      <p>Hi ${user.firstName},</p>
      <p>Unfortunately, your portal access request has been declined at this time.</p>
      <p>If you believe this was in error, please contact the VP of Education directly.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #666;">This is an automated message from the DTCGC Agenda Workflow Engine.</p>
    </div>
  `;

  await quietlySendEmail(user.email, subject, html);
  revalidatePath('/admin/accounts');
}

export async function seedMockMembers() {
  // Check if mock members already exist to prevent duplicate floods
  const existingMocks = await db.user.count({
    where: { email: { contains: 'mockmember' } }
  });

  if (existingMocks > 0) return { success: false, message: "Mocks already seeded." };

  const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez'];

  const testUsers = [];
  
  for (let i = 0; i < 12; i++) {
     testUsers.push({
         firstName: firstNames[i],
         lastName: lastNames[i],
         email: `mockmember${i}@dtcgc.local`,
         role: 'MEMBER'
     });
  }

  // Create users and randomly assign them history timestamps to spread out the heuristics table
  const createdUsers = await db.$transaction(
     testUsers.map(u => db.user.create({ data: u }))
  );

  // Distribute dummy role assignments over the past 3 months
  const rolePool = ['Toastmaster', 'Timer', 'Speaker 1', 'Table Topics Master', 'Evaluator 1', 'Grammarian'];
  const assignments = [];
  
  for (let i = 0; i < createdUsers.length; i++) {
      const u = createdUsers[i];
      // Random date between today and -90 days
      const daysAgo = Math.floor(Math.random() * 90);
      const assignDate = new Date();
      assignDate.setDate(assignDate.getDate() - daysAgo);
      
      assignments.push({
          userId: u.id,
          meetingId: 'mock-seed-meeting-id', // Just a placeholder meeting
          roleName: rolePool[i % rolePool.length],
          assignedAt: assignDate
      });
  }

  // Ensure this dummy meeting exists to satisfy referential integrity
  await db.meetingTemplate.upsert({
      where: { id: 'dummy-template' },
      update: {},
      create: { id: 'dummy-template', type: 'Standard', schemaStructure: '{}' }
  });

  await db.meeting.upsert({
      where: { id: 'mock-seed-meeting-id' },
      update: {},
      create: { 
          id: 'mock-seed-meeting-id', 
          date: new Date(), 
          typeId: 'dummy-template', 
          theme: 'Mock History' 
      }
  });

  await db.roleAssignment.createMany({
      data: assignments
  });

  revalidatePath('/admin/accounts');
  return { success: true, message: "Generated 12 deterministic mock members successfully." };
}

export async function subscribeGuest(email: string) {
  try {
    await db.subscriber.create({
      data: { email }
    });
    return { success: true };
  } catch (error) {
    console.error("Subscription error:", error);
    return { success: false, error: "Email already subscribed or invalid." };
  }
}

export async function removeUser(userId: string) {
  await db.user.delete({
    where: { id: userId }
  });
  revalidatePath('/admin/accounts');
}

export async function removeSubscriber(subscriberId: string) {
  await db.subscriber.delete({
    where: { id: subscriberId }
  });
  revalidatePath('/admin/accounts');
}
